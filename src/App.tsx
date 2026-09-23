import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CommandResponse, Device, HomeState, QueueTrack, SonosZone } from "../shared/types.ts";
import { DeviceCard } from "./components/DeviceCard.tsx";
import { ZoneCard } from "./components/ZoneCard.tsx";
import { ZoneDetail } from "./components/ZoneDetail.tsx";
import { Section } from "./components/Section.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { fetchHealth, fetchHome, fetchZones, fetchStations, fetchQueue, queueControl, playFavorite, playSpotify, playRadio, sendCommand, zoneControl, type HealthInfo, type StationInfo } from "./api.ts";

// Minimal typing for the browser Web Speech API (not in lib.dom yet).
interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface SpeechRecog {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart?: () => void;
  onresult: (e: SpeechResultEvent) => void;
  onend: () => void;
  onerror?: (e: { error?: string }) => void;
  start: () => void;
  stop: () => void;
}

const EXAMPLES = [
  "Play some music on the deck",
  "Turn it up in the kitchen",
  "Group the deck with the living room",
  "Play music on the deck and turn off the kitchen lights",
  "Dim the living room lights and close the blinds",
  "It's too warm in the bedroom",
  "Lock all the doors, I'm leaving",
  "What's the weather like today?",
];

function toggleDevice(d: Device): Partial<Device> {
  if (d.type === "lock") return { locked: !d.locked, on: !d.locked };
  if (d.type === "blinds") return { on: !d.on, level: d.on ? 0 : 100 };
  if (d.type === "fan") return { on: !d.on, intensity: d.on ? 0 : 60 };
  return { on: !d.on };
}

export function App() {
  const [home, setHome] = useState<HomeState | null>(null);
  const [zones, setZones] = useState<SonosZone[]>([]);
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [detailZoneId, setDetailZoneId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<{ stop: () => void } | null>(null);
  const [result, setResult] = useState<CommandResponse | null>(null);
  const [reply, setReply] = useState<{ text: string; error?: boolean; meta?: string } | null>(null);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchHome().then(setHome).catch(() => setHome(null));
    fetchZones().then(setZones).catch(() => setZones([]));
    fetchStations().then(setStations).catch(() => setStations([]));
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  // Smoothly advance the progress bar for playing zones.
  useEffect(() => {
    const id = window.setInterval(() => {
      setZones((zs) =>
        zs.map((z) =>
          z.playback === "playing" && z.duration
            ? { ...z, elapsed: Math.min(z.duration, (z.elapsed ?? 0) + 1) }
            : z,
        ),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // With a real speaker, poll so the panel reflects changes made anywhere
  // (Spotify, the Sonos app, etc.). Skipped for the mock, which the client owns.
  useEffect(() => {
    if (!health || health.sonos === "mock") return;
    const id = window.setInterval(() => {
      fetchZones().then(setZones).catch(() => {});
    }, 4000);
    return () => window.clearInterval(id);
  }, [health]);

  // Load and refresh the queue whenever a zone detail view is open.
  useEffect(() => {
    if (!detailZoneId) return;
    let cancelled = false;
    const load = () =>
      fetchQueue(detailZoneId)
        .then((q) => !cancelled && setQueue(q))
        .catch(() => !cancelled && setQueue([]));
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [detailZoneId]);

  async function onZoneControl(zoneId: string, action: string, value?: number, station?: string) {
    // Optimistic update so touch feels instant.
    setZones((zs) =>
      zs.map((z) => {
        if (z.id !== zoneId) return z;
        if (action === "set_volume" && value !== undefined) return { ...z, volume: value };
        if (action === "play") return { ...z, playback: "playing" };
        if (action === "pause") return { ...z, playback: "paused" };
        return z;
      }),
    );
    try {
      setZones(await zoneControl(zoneId, action, value, station));
    } catch {
      fetchZones().then(setZones).catch(() => {});
    }
    if (detailZoneId === zoneId) fetchQueue(zoneId).then(setQueue).catch(() => {});
  }

  async function onQueueControl(op: "play" | "remove", position: number) {
    if (!detailZoneId) return;
    try {
      setQueue(await queueControl(detailZoneId, op, position));
    } catch {
      fetchQueue(detailZoneId).then(setQueue).catch(() => {});
    }
    fetchZones().then(setZones).catch(() => {});
  }

  async function onPlayFavorite(id: string) {
    if (!detailZoneId) return;
    try {
      setZones(await playFavorite(detailZoneId, id));
    } catch (e) {
      setReply({ text: e instanceof Error ? e.message : "Couldn't play that favorite.", error: true });
    }
    fetchQueue(detailZoneId).then(setQueue).catch(() => {});
  }

  async function onPlaySpotifyTrack(uri: string, title: string, mode: "now" | "end" = "now") {
    if (!detailZoneId) return;
    const zid = detailZoneId;
    try {
      setZones(await playSpotify(zid, uri, title, mode));
    } catch (e) {
      setReply({ text: e instanceof Error ? e.message : "Couldn't play that track.", error: true });
    }
    // Sonos needs a moment to load Spotify metadata; refresh now and shortly after.
    const refresh = () => {
      fetchQueue(zid).then(setQueue).catch(() => {});
      fetchZones().then(setZones).catch(() => {});
    };
    refresh();
    window.setTimeout(refresh, 1500);
  }

  async function onPlayRadioStation(url: string, name: string) {
    if (!detailZoneId) return;
    try {
      setZones(await playRadio(detailZoneId, url, name));
    } catch (e) {
      setReply({ text: e instanceof Error ? e.message : "Couldn't play that station.", error: true });
    }
    fetchQueue(detailZoneId).then(setQueue).catch(() => {});
  }

  const status = useMemo(() => {
    if (!home) return { on: 0, temp: 0, locks: 0, unlocked: 0 };
    const lights = home.devices.filter((d) => d.type === "light");
    const on = lights.filter((d) => d.on).length;
    const thermos = home.devices.filter((d) => d.type === "thermostat");
    const temp = thermos.length ? Math.round(thermos.reduce((s, d) => s + (d.temperature ?? 0), 0) / thermos.length) : 0;
    const locks = home.devices.filter((d) => d.type === "lock");
    const unlocked = locks.filter((d) => !d.locked).length;
    return { on, temp, locks: locks.length, unlocked };
  }, [home]);

  const byRoom = useMemo(() => {
    const map = new Map<string, Device[]>();
    if (home) for (const d of home.devices) {
      const list = map.get(d.room) ?? [];
      list.push(d);
      map.set(d.room, list);
    }
    return map;
  }, [home]);

  function flash(ids: string[]) {
    setFlashing(new Set(ids));
    window.setTimeout(() => setFlashing(new Set()), 750);
  }

  // ----- Collapsible + reorderable sections (persisted) -----
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("aura.collapsed") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [order, setOrder] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("aura.order") ?? "[]");
    } catch {
      return [];
    }
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(
    () => localStorage.getItem("aura.inspector") !== "closed",
  );

  function toggleInspector() {
    setInspectorOpen((o) => {
      const next = !o;
      localStorage.setItem("aura.inspector", next ? "open" : "closed");
      return next;
    });
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("aura.collapsed", JSON.stringify([...next]));
      return next;
    });
  }

  const sectionDefs = useMemo(() => {
    const defs: { id: string; title: string; subtitle: string; render: () => ReactNode }[] = [];
    if (zones.length > 0) {
      defs.push({
        id: "speakers",
        title: "Speakers",
        subtitle: `Sonos · ${zones.length} zones`,
        render: () => (
          <div className="grid zones-grid">
            {zones.map((z) => (
              <ZoneCard
                key={z.id}
                zone={z}
                flash={flashing.has(z.id)}
                onControl={(action, value, station) => onZoneControl(z.id, action, value, station)}
                onOpen={() => setDetailZoneId(z.id)}
              />
            ))}
          </div>
        ),
      });
    }
    if (home) {
      for (const room of home.rooms) {
        const devices = byRoom.get(room.id) ?? [];
        if (devices.length === 0) continue;
        defs.push({
          id: room.id,
          title: room.name,
          subtitle: `${devices.length} devices`,
          render: () => (
            <div className="grid">
              {devices.map((d) => (
                <DeviceCard key={d.id} device={d} flash={flashing.has(d.id)} onToggle={onManualToggle} />
              ))}
            </div>
          ),
        });
      }
    }
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, zones, stations, byRoom, flashing]);

  const orderedSections = useMemo(() => {
    const byId = new Map(sectionDefs.map((d) => [d.id, d]));
    const seen = new Set<string>();
    const out: typeof sectionDefs = [];
    for (const id of order) {
      const d = byId.get(id);
      if (d && !seen.has(id)) {
        out.push(d);
        seen.add(id);
      }
    }
    for (const d of sectionDefs) if (!seen.has(d.id)) out.push(d);
    return out;
  }, [sectionDefs, order]);

  function moveSection(from: string, to: string) {
    if (from === to) return;
    const ids = orderedSections.map((d) => d.id);
    const fi = ids.indexOf(from);
    const ti = ids.indexOf(to);
    if (fi < 0 || ti < 0) return;
    ids.splice(ti, 0, ids.splice(fi, 1)[0]);
    setOrder(ids);
    localStorage.setItem("aura.order", JSON.stringify(ids));
  }

  function onManualToggle(d: Device) {
    if (!home) return;
    const patch = toggleDevice(d);
    setHome({ ...home, devices: home.devices.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) });
  }

  // Voice input via the browser's built-in speech recognition.
  function toggleVoice() {
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecog; webkitSpeechRecognition?: new () => SpeechRecog };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setReply({ text: "Voice input isn't supported in this browser — try Chrome.", error: true });
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => setReply({ text: "🎤 Listening... speak your command" });
    rec.onresult = (e: SpeechResultEvent) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
        submit(text);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e: unknown) => {
      setListening(false);
      const errorMsg = (e as { error?: string })?.error || "Unknown error";
      const messages: Record<string, string> = {
        "no-speech": "No speech detected. Try speaking louder or closer to the mic.",
        "network": "Network error. Check your connection.",
        "permission-denied": "Microphone access denied. Check browser permissions.",
        "audio-capture": "No microphone found. Check your device.",
      };
      const msg = messages[errorMsg] || `Voice error: ${errorMsg}`;
      setReply({ text: msg, error: true });
    };
    recogRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function submit(text: string) {
    if (!home || !text.trim() || loading) return;
    setLoading(true);
    setReply(null);
    try {
      const res = await sendCommand(text.trim(), home);
      setResult(res);
      const flashIds = res.actions.map((a) => a.deviceId);
      if (res.home) setHome(res.home);
      if (res.zones) {
        setZones(res.zones);
        flashIds.push(...res.audioActions.map((a) => a.zone));
      }
      flash(flashIds);
      const meta = [
        `${res.usage.calls} call${res.usage.calls === 1 ? "" : "s"}`,
        `${res.latencyMs}ms`,
        `${res.usage.inputTokens + res.usage.outputTokens} tokens`,
      ].join(" · ");
      setReply({ text: res.reply, meta });
      setInput("");
    } catch (err) {
      setReply({ text: err instanceof Error ? err.message : "Something went wrong.", error: true });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className={`app ${inspectorOpen ? "" : "solo"}`}>
      {!inspectorOpen && (
        <button className="inspector-reopen" onClick={toggleInspector} aria-label="Show decision trace">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 6 9 12 15 18" />
          </svg>
          <span>Decision Trace</span>
        </button>
      )}
      <main className="main">
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">A</div>
            <div>
              <h1>Aura</h1>
              <p>Smart home · powered by TypeSafe</p>
            </div>
          </div>
          <div className="status-pills">
            <span className="pill">
              <span className="dot" /> <b>{status.on}</b> lights on
            </span>
            <span className="pill">
              <b>{status.temp}°</b> avg
            </span>
            <span className="pill">
              <b>{status.unlocked === 0 ? "All locked" : `${status.unlocked} open`}</b>
            </span>
          </div>
        </div>

        {health && !health.typesafe && (
          <div className="warn-banner">
            No <code>TYPESAFE_API_KEY</code> found. Add it to <code>.env</code> and restart the server to enable
            natural-language control.
          </div>
        )}

        <div className="command">
          <div className="command-row">
            <input
              ref={inputRef}
              value={input}
              placeholder="Tell Aura what to do…  e.g. “dim the living room and lock the doors”"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit(input)}
            />
            <button
              className={`mic${listening ? " listening" : ""}`}
              onClick={toggleVoice}
              aria-label={listening ? "Stop listening" : "Speak a command"}
              title={listening ? "Listening… tap to stop" : "Speak a command"}
            >
              🎤
            </button>
            <button className="send" disabled={loading || !input.trim()} onClick={() => submit(input)}>
              {loading ? <span className="spinner" /> : "Send"}
            </button>
          </div>
          <div className="chips">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => submit(ex)} disabled={loading}>
                {ex}
              </button>
            ))}
          </div>
          {reply && (
            <div className={`reply ${reply.error ? "error" : ""}`}>
              <span className="reply-avatar" />
              <div>
                <p>{reply.text}</p>
                {reply.meta && <small>{reply.meta}</small>}
              </div>
            </div>
          )}
        </div>

        {orderedSections.map((sec) => (
          <Section
            key={sec.id}
            title={sec.title}
            subtitle={sec.subtitle}
            collapsed={collapsed.has(sec.id)}
            onToggle={() => toggleCollapse(sec.id)}
            onDragStart={() => setDragId(sec.id)}
            onDragEnter={() => setOverId(sec.id)}
            onDrop={() => {
              if (dragId) moveSection(dragId, sec.id);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            dragging={dragId === sec.id}
            over={overId === sec.id && dragId !== sec.id}
          >
            {sec.render()}
          </Section>
        ))}
      </main>

      {inspectorOpen && <Inspector result={result} onCollapse={toggleInspector} />}

      {detailZoneId &&
        (() => {
          const dz = zones.find((z) => z.id === detailZoneId);
          if (!dz) return null;
          return (
            <ZoneDetail
              zone={dz}
              queue={queue}
              stations={stations}
              spotifyEnabled={Boolean(health?.spotify)}
              onClose={() => setDetailZoneId(null)}
              onControl={(action, value, station) => onZoneControl(dz.id, action, value, station)}
              onQueue={onQueueControl}
              onPlayFavorite={onPlayFavorite}
              onPlaySpotify={onPlaySpotifyTrack}
              onPlayRadio={onPlayRadioStation}
            />
          );
        })()}
    </div>
  );
}
