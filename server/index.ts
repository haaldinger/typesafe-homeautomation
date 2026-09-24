import "dotenv/config";
import express from "express";
import cors from "cors";
import type { AudioAction, CommandResolution, CommandResponse, DeviceAction, PatternAction, PatternSpec } from "../shared/types.ts";
import { buildQuestions, homeSummary, systemOne } from "./typesafe.ts";
import { applyActions, applyOverrides, categoryOf, isCompound, resolveCommand, treatStopAsLightCommand } from "./resolve.ts";
import { conversationalReply, llmEnabled, splitRequest } from "./llm.ts";
import { getGateway } from "./gateway.ts";
import { resetMockZones, sonosGateway } from "./sonos.ts";
import { STATIONS, stationById } from "./stations.ts";
import { searchSpotify, spotifyConfigured } from "./spotify.ts";
import { fetchLyrics } from "./lyrics.ts";
import { searchRadio } from "./radio.ts";
import { rawTransportDirect } from "./sonos-direct.ts";
import { getLightSync, setLightSync, startLightSync } from "./lightsync.ts";
import { suggestFor } from "./suggest.ts";
import { interruptPatterns, listPatterns, PATTERN_PRESETS, startPattern, stopPattern } from "./patterns.ts";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const gateway = getGateway();
if (gateway.name !== "sim") startLightSync(gateway, sonosGateway);
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

// Direct (non-NL) device control from the touch UI. Returns the refreshed home.
app.post("/api/device", async (req, res) => {
  try {
    const actions: DeviceAction[] = Array.isArray(req.body?.actions) ? req.body.actions : [];
    if (actions.some((a) => typeof a?.deviceId !== "string" || typeof a?.patch !== "object")) {
      res.status(400).json({ error: "Each action needs a deviceId and a patch" });
      return;
    }
    interruptPatterns(gateway, actions.map((a) => a.room));
    await gateway.commit(actions);
    res.json(await gateway.loadState(req.body?.home));
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Repeating light patterns (blink, alternate, pulse, fireplace, police).
app.get("/api/patterns", (_req, res) => {
  res.json(listPatterns());
});

app.post("/api/patterns", async (req, res) => {
  try {
    const room: string = req.body?.room ?? "";
    const kind = req.body?.kind as PatternSpec["kind"];
    if (!room || !(kind in PATTERN_PRESETS)) {
      res.status(400).json({ error: "room and a valid pattern kind are required" });
      return;
    }
    const preset = PATTERN_PRESETS[kind];
    const colors: string[] = Array.isArray(req.body?.colors)
      ? req.body.colors.filter((c: unknown) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
      : preset.colors;
    await startPattern(gateway, room, { kind, colors, intervalMs: Number(req.body?.intervalMs) || preset.intervalMs });
    res.json(listPatterns());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

app.post("/api/patterns/stop", async (req, res) => {
  try {
    await stopPattern(gateway, req.body?.room || "all");
    res.json(listPatterns());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// Which Sonos zone's album art drives which room's lights.
app.get("/api/light-sync", (_req, res) => {
  res.json(getLightSync());
});

app.post("/api/light-sync", (req, res) => {
  const zoneId: string = req.body?.zoneId ?? "";
  const roomId: string | null = req.body?.roomId || null;
  if (!zoneId) {
    res.status(400).json({ error: "zoneId is required" });
    return;
  }
  res.json(setLightSync(zoneId, roomId));
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

// "More like this": playable Spotify tracks similar to an artist.
app.get("/api/suggest", async (req, res) => {
  try {
    const artist = (req.query.artist ?? "").toString();
    if (!artist) {
      res.status(400).json({ error: "artist is required" });
      return;
    }
    if (!spotifyConfigured()) {
      res.status(503).json({ error: "Spotify isn't configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET." });
      return;
    }
    res.json(await suggestFor(artist, (req.query.title ?? "").toString()));
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
    if (action === "group") {
      // Optional list of zone ids to join to this coordinator. Chips carry every
      // member name (like the resolver's group action) and the summary names them
      // too, so both the mock and live (node-sonos-http-api) paths can apply it.
      const memberIds: string[] = Array.isArray(req.body?.members) ? req.body.members.map(String) : [];
      const members = zones.filter((z) => z.id !== zone.id && memberIds.includes(z.id));
      if (members.length === 0) {
        res.status(400).json({ error: "group needs at least one other zone id in 'members'" });
        return;
      }
      const names = [zone.name, ...members.map((m) => m.name)];
      audioAction.chips = names;
      audioAction.summary = `${zone.name} grouped with ${members.map((m) => m.name).join(", ")}`;
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
  patternActions: PatternAction[],
): string {
  const summaries = [
    ...actions.map((a) => a.summary),
    ...audioActions.map((a) => a.summary),
    ...patternActions.filter((p) => p.op === "start").map((p) => p.summary),
  ];
  // Stopping a pattern also sends "party mode off" to every light; one line is enough.
  if (patternActions.some((p) => p.op === "stop") && !patternActions.some((p) => p.op === "start")) {
    const stop = patternActions.find((p) => p.op === "stop")!;
    return `Done — lights in ${stop.roomName} back to normal.`;
  }
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
  // Answers the user picked in a follow-up ("Kitchen or Living room?").
  const overrides: Record<string, string> = Object.fromEntries(
    Object.entries(req.body?.overrides ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"),
  );

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
        {
          request: text,
          home: homeSummary(home),
          speaker_zones: zones.map((z) => z.name),
          light_patterns_running: listPatterns().map((p) => `${p.room}: ${p.label}`),
        },
        questions,
      );
      calls += 1;
      inputTokens += r.usage.input_tokens;
      outputTokens += r.usage.output_tokens;
      return r;
    };

    // 1. Speculative fan-out: one call, every question.
    const base = await evaluate(request);
    treatStopAsLightCommand(base, listPatterns().length > 0);
    applyOverrides(base, overrides);
    const category = categoryOf(base);
    // A follow-up answer applies to the whole request, so don't split it again.
    const compound = Object.keys(overrides).length === 0 && isCompound(base);

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
      // 2. LLM pairing: split into atomic requests, evaluate each with TypeSafe (in parallel).
      const { commands: parts, usedLlm: llmUsed } = await splitRequest(request);
      usedLlm = llmUsed;
      const results = await Promise.all(
        parts.map((part) => evaluate(part)),
      );
      for (let i = 0; i < parts.length; i++) {
        const resolution = resolveCommand(parts[i], workingHome, zones, results[i], questions, false);
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

    const allPatternActions = resolutions.flatMap((r) => r.patternActions ?? []);

    // "Play more like this": queue similar songs after whatever is playing.
    for (const a of allAudioActions.filter((x) => x.kind === "play_similar")) {
      const zone = zones.find((z) => z.id === a.zone);
      if (!zone?.track?.artist || zone.track.artist === "Radio") {
        a.summary = `nothing playing on ${a.zoneName} to match`;
        continue;
      }
      const picks = spotifyConfigured() ? await suggestFor(zone.track.artist, zone.track.title).catch(() => []) : [];
      for (const t of picks) await sonosGateway.playSpotify(zone.id, t.uri, `${t.name} — ${t.artist}`, "end");
      a.summary = picks.length
        ? `queued ${picks.length} songs like ${zone.track.artist} on ${a.zoneName}`
        : `couldn't find songs like ${zone.track.artist}`;
      a.chips = picks.slice(0, 3).map((t) => t.name);
    }

    // A direct change to a room takes over from any pattern running there, except
    // rooms being stopped explicitly, which get their lights restored below.
    const stopping = new Set(allPatternActions.filter((p) => p.op === "stop").map((p) => p.room));
    if (gateway.name !== "sim" && !stopping.has("all")) {
      interruptPatterns(gateway, allActions.map((a) => a.room).filter((room) => !stopping.has(room)));
    }

    // Push the decided actions to the real backends (no-op for the simulator) in parallel.
    const [, zonesAfter] = await Promise.all([
      gateway.commit(allActions),
      allAudioActions.length > 0 ? sonosGateway.apply(allAudioActions).then(() => sonosGateway.getZones()) : Promise.resolve(zones),
    ]);

    const patternNotes: string[] = [];
    if (gateway.name !== "sim") {
      for (const p of allPatternActions) {
        if (p.op === "stop") await stopPattern(gateway, p.room);
        else if (p.spec) await startPattern(gateway, p.room, p.spec).catch((e) => patternNotes.push(errMsg(e)));
      }
    } else if (allPatternActions.some((p) => p.op === "start")) {
      patternNotes.push("Light patterns need real lights (set GATEWAY=hue or homeassistant).");
    }

    // Real backends report the true result (a scene changes many lights at once).
    const homeAfter =
      gateway.name !== "sim" && (allActions.length > 0 || allPatternActions.length > 0)
        ? await gateway.loadState().catch(() => workingHome)
        : workingHome;

    const response: CommandResponse = {
      reply: [summarizeReply(resolutions, allActions, allAudioActions, allPatternActions), ...patternNotes].join(" "),
      patternActions: allPatternActions,
      patterns: listPatterns(),
      clarify: resolutions.find((r) => r.clarify)?.clarify,
      request,
      category,
      isCompound: compound,
      usedLlm,
      resolutions,
      actions: allActions,
      audioActions: allAudioActions,
      usage: { inputTokens, outputTokens, calls },
      latencyMs: Date.now() - started,
      home: homeAfter,
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
