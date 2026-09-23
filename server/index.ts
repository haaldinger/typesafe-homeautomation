import "dotenv/config";
import express from "express";
import cors from "cors";
import type { AudioAction, CommandResolution, CommandResponse, DeviceAction } from "../shared/types.ts";
import { buildQuestions, homeSummary, systemOne } from "./typesafe.ts";
import { applyActions, categoryOf, isCompound, resolveCommand } from "./resolve.ts";
import { conversationalReply, llmEnabled, splitRequest } from "./llm.ts";
import { getGateway } from "./gateway.ts";
import { resetMockZones, sonosGateway } from "./sonos.ts";
import { STATIONS, stationById } from "./stations.ts";
import { searchSpotify, spotifyConfigured } from "./spotify.ts";
import { fetchLyrics } from "./lyrics.ts";
import { searchRadio } from "./radio.ts";
import { rawTransportDirect } from "./sonos-direct.ts";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const gateway = getGateway();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    typesafe: Boolean(process.env.TYPESAFE_API_KEY),
    llm: llmEnabled(),
    gateway: gateway.name,
    sonos: sonosGateway.mode,
    spotify: spotifyConfigured(),
    spotifyLinked: sonosGateway.spotifyLinked(),
  });
});

app.get("/api/home", async (_req, res) => {
  try {
    res.json(await gateway.loadState());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

app.get("/api/zones", async (_req, res) => {
  try {
    res.json(await sonosGateway.getZones());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

app.post("/api/reset", (_req, res) => {
  resetMockZones();
  res.json({ ok: true });
});

app.get("/api/stations", (_req, res) => {
  res.json(STATIONS.map((s) => ({ id: s.id, name: s.name, ...(s.category ? { category: s.category } : {}) })));
});

// Play queue for one zone (WallPanel-style now-playing detail view).
app.get("/api/zones/:id/queue", async (req, res) => {
  try {
    res.json(await sonosGateway.getQueue(req.params.id));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Jump to or remove a queue track.
app.post("/api/queue-control", async (req, res) => {
  try {
    const zoneId: string = req.body?.zoneId ?? "";
    const op: "play" | "remove" = req.body?.op === "remove" ? "remove" : "play";
    const position = Number(req.body?.position);
    if (!zoneId || !Number.isFinite(position) || position < 1) {
      res.status(400).json({ error: "zoneId and a 1-based position are required" });
      return;
    }
    await sonosGateway.queueControl(zoneId, op, position);
    res.json(await sonosGateway.getQueue(zoneId));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Saved Sonos favorites (stations, playlists, albums).
app.get("/api/favorites", async (_req, res) => {
  try {
    res.json(await sonosGateway.getFavorites());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

app.post("/api/favorite", async (req, res) => {
  try {
    const zoneId: string = req.body?.zoneId ?? "";
    const id: string = req.body?.id ?? "";
    if (!zoneId || !id) {
      res.status(400).json({ error: "zoneId and favorite id are required" });
      return;
    }
    await sonosGateway.playFavorite(zoneId, id);
    res.json(await sonosGateway.getZones());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Spotify search + play-on-zone.
app.get("/api/spotify/search", async (req, res) => {
  try {
    if (!spotifyConfigured()) {
      res.status(503).json({ error: "Spotify isn't configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET." });
      return;
    }
    const q = (req.query.q ?? "").toString();
    res.json(await searchSpotify(q));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

app.post("/api/spotify/play", async (req, res) => {
  try {
    const zoneId: string = req.body?.zoneId ?? "";
    const uri: string = req.body?.uri ?? "";
    const title: string = req.body?.title ?? "Spotify track";
    const mode: "now" | "end" = req.body?.mode === "end" ? "end" : "now";
    if (!zoneId || !uri) {
      res.status(400).json({ error: "zoneId and a Spotify uri are required" });
      return;
    }
    await sonosGateway.playSpotify(zoneId, uri, title, mode);
    res.json(await sonosGateway.getZones());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Time-synced (or plain) lyrics for a track.
app.get("/api/lyrics", async (req, res) => {
  try {
    const artist = (req.query.artist ?? "").toString();
    const title = (req.query.title ?? "").toString();
    const duration = Number(req.query.duration ?? 0) || 0;
    if (!artist || !title) {
      res.status(400).json({ error: "artist and title are required" });
      return;
    }
    res.json(await fetchLyrics(artist, title, duration));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Debug: raw transport URIs for a zone (used to learn Spotify Connect scheme).
app.get("/api/debug/raw/:id", async (req, res) => {
  try {
    res.json(await rawTransportDirect(req.params.id));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Internet-radio directory search + play.
app.get("/api/radio/search", async (req, res) => {
  try {
    const q = (req.query.q ?? "").toString();
    res.json(await searchRadio(q));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

app.post("/api/radio/play", async (req, res) => {
  try {
    const zoneId: string = req.body?.zoneId ?? "";
    const url: string = req.body?.url ?? "";
    const name: string = req.body?.name ?? "Radio";
    if (!zoneId || !url) {
      res.status(400).json({ error: "zoneId and a stream url are required" });
      return;
    }
    await sonosGateway.playRadio(zoneId, url, name);
    res.json(await sonosGateway.getZones());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Sound / EQ controls for a zone.
app.get("/api/zones/:id/eq", async (req, res) => {
  try {
    res.json(await sonosGateway.getEq(req.params.id));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

app.post("/api/eq", async (req, res) => {
  try {
    const zoneId: string = req.body?.zoneId ?? "";
    const field = req.body?.field as "bass" | "treble" | "night" | "loudness";
    const value = req.body?.value;
    if (!zoneId || !["bass", "treble", "night", "loudness"].includes(field)) {
      res.status(400).json({ error: "zoneId and a valid field are required" });
      return;
    }
    await sonosGateway.setEq(zoneId, field, value);
    res.json(await sonosGateway.getEq(zoneId));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Direct (non-NL) zone control for the touch UI: transport, volume, grouping.
app.post("/api/zone-control", async (req, res) => {
  try {
    const zoneId: string = req.body?.zoneId ?? "";
    const action: string = req.body?.action ?? "";
    const value = req.body?.value;
    const stationId: string = req.body?.station ?? "";
    const zones = await sonosGateway.getZones();
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) {
      res.status(404).json({ error: "Unknown zone" });
      return;
    }
    const chips = action === "set_volume" ? [`vol ${value}`] : [];
    const audioAction: AudioAction = {
      zone: zone.id,
      zoneName: zone.name,
      kind: action,
      summary: `${zone.name} ${action}`,
      chips,
    };
    if (action === "play_station") {
      const st = stationById(stationId);
      if (!st) {
        res.status(400).json({ error: "Unknown station" });
        return;
      }
      audioAction.chips = [st.name];
      audioAction.uri = st.url;
      audioAction.name = st.name;
      audioAction.summary = `${zone.name} playing ${st.name}`;
    }
    await sonosGateway.apply([audioAction]);
    res.json(await sonosGateway.getZones());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

function summarizeReply(
  resolutions: CommandResolution[],
  actions: DeviceAction[],
  audioActions: AudioAction[],
): string {
  const summaries = [...actions.map((a) => a.summary), ...audioActions.map((a) => a.summary)];
  if (summaries.length === 0) {
    const notes = resolutions.map((r) => r.note).filter(Boolean);
    return notes.length ? notes.join(" ") : "I couldn't find anything to do for that.";
  }
  if (summaries.length <= 3) return `Done — ${summaries.join(", ")}.`;
  return `Done — ${summaries.length} actions, including ${summaries.slice(0, 2).join(", ")}.`;
}

app.post("/api/command", async (req, res) => {
  const started = Date.now();
  const request: string = (req.body?.request ?? "").toString().trim();

  if (!request) {
    res.status(400).json({ error: "Missing 'request'." });
    return;
  }

  try {
    const home = await gateway.loadState(req.body?.home);
    const zones = await sonosGateway.getZones();
    const questions = buildQuestions(home, zones);
    let calls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let usedLlm = false;

    const evaluate = async (text: string) => {
      const r = await systemOne(
        { request: text, home: homeSummary(home), speaker_zones: zones.map((z) => z.name) },
        questions,
      );
      calls += 1;
      inputTokens += r.usage.input_tokens;
      outputTokens += r.usage.output_tokens;
      return r;
    };

    // 1. Speculative fan-out: one call, every question.
    const base = await evaluate(request);
    const category = categoryOf(base);
    const compound = isCompound(base);

    const resolutions: CommandResolution[] = [];
    let workingHome = home;
    const allActions: DeviceAction[] = [];
    const allAudioActions: AudioAction[] = [];

    if (category === "conversation") {
      const { reply, usedLlm: llmUsed } = await conversationalReply(request);
      usedLlm = llmUsed;
      resolutions.push(resolveCommand(request, workingHome, zones, base, questions));
      const response: CommandResponse = {
        reply,
        request,
        category,
        isCompound: false,
        usedLlm,
        resolutions,
        actions: [],
        audioActions: [],
        usage: { inputTokens, outputTokens, calls },
        latencyMs: Date.now() - started,
      };
      res.json(response);
      return;
    }

    if (compound) {
      // 2. LLM pairing: split into atomic requests, evaluate each with TypeSafe.
      const { commands: parts, usedLlm: llmUsed } = await splitRequest(request);
      usedLlm = llmUsed;
      for (const part of parts) {
        const r = parts.length === 1 && part === request ? base : await evaluate(part);
        const resolution = resolveCommand(part, workingHome, zones, r, questions);
        resolutions.push(resolution);
        workingHome = applyActions(workingHome, resolution.actions);
        allActions.push(...resolution.actions);
        allAudioActions.push(...resolution.audioActions);
      }
    } else {
      const resolution = resolveCommand(request, workingHome, zones, base, questions);
      resolutions.push(resolution);
      workingHome = applyActions(workingHome, resolution.actions);
      allActions.push(...resolution.actions);
      allAudioActions.push(...resolution.audioActions);
    }

    // Push the decided actions to the real backends (no-op for the simulator).
    await gateway.commit(allActions);
    await sonosGateway.apply(allAudioActions);
    const zonesAfter = allAudioActions.length > 0 ? await sonosGateway.getZones() : zones;

    const response: CommandResponse = {
      reply: summarizeReply(resolutions, allActions, allAudioActions),
      request,
      category,
      isCompound: compound,
      usedLlm,
      resolutions,
      actions: allActions,
      audioActions: allAudioActions,
      usage: { inputTokens, outputTokens, calls },
      latencyMs: Date.now() - started,
      home: workingHome,
      zones: zonesAfter,
    };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`[aura] server on http://localhost:${port}`);
  console.log(
    `[aura] gateway: ${gateway.name} | sonos: ${sonosGateway.mode} | TypeSafe key: ${process.env.TYPESAFE_API_KEY ? "set" : "MISSING"} | LLM: ${llmEnabled() ? "on" : "off (heuristics)"}`,
  );
});
