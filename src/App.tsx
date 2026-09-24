import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  ClarifyOption,
  CommandResponse,
  Device,
  DeviceAction,
  DevicePatch,
  HomeState,
  LightScene,
  PatternKind,
  QueueTrack,
  RunningPattern,
  SonosZone,
} from "../shared/types.ts";
import { DeviceCard } from "./components/DeviceCard.tsx";
import { ZoneCard } from "./components/ZoneCard.tsx";
import { ZoneDetail } from "./components/ZoneDetail.tsx";
import { Section, type SummaryChip } from "./components/Section.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { Topbar } from "./components/Topbar.tsx";
import { QuickScenes } from "./components/QuickScenes.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import {
  fetchHealth,
  fetchHome,
  controlDevices,
  fetchLightSync,
  updateLightSync,
  fetchPatterns,
  startPattern,
  stopPattern,
  fetchZones,
  fetchStations,
  fetchQueue,
  queueControl,
  playFavorite,
  playSpotify,
  playRadio,
  sendCommand,
  zoneControl,
  groupZones,
  ungroupZone,
  type HealthInfo,
  type StationInfo,
} from "./api.ts";
import { Mic, Send, Sparkles, Activity, AlertCircle, Clock, Waves, Square } from "lucide-react";

const PATTERN_BUTTONS: { kind: PatternKind; label: string; icon: string }[] = [
  { kind: "blink", label: "Blink", icon: "💡" },
  { kind: "alternate", label: "Alternate", icon: "🔀" },
  { kind: "pulse", label: "Pulse", icon: "🌊" },
  { kind: "fireplace", label: "Fireplace", icon: "🔥" },
  { kind: "police", label: "Police", icon: "🚨" },
];

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
  { label: "Deck music", cmd: "Play some music on the deck" },
  { label: "Turn it up (kitchen)", cmd: "Turn it up in the kitchen" },
  { label: "Group deck + living", cmd: "Group the deck with the living room" },
  { label: "Deck music + kitchen lights off", cmd: "Play music on the deck and turn off the kitchen lights" },
  { label: "Dim living + close blinds", cmd: "Dim the living room lights and close the blinds" },
  { label: "Too warm in bedroom", cmd: "It's too warm in the bedroom" },
  { label: "Lock up", cmd: "Lock all the doors, I'm leaving" },
  { label: "Weather?", cmd: "What's the weather like today?" },
];

function roomSummary(devices: Device[]): SummaryChip[] {
  const chips: SummaryChip[] = [];
  const of = (t: Device["type"]) => devices.filter((d) => d.type === t);
  const lights = of("light");
  if (lights.length) {
    const on = lights.filter((d) => d.on).length;
    chips.push(on ? { label: `${on}/${lights.length} lights on`, tone: "on" } : { label: "Lights off", tone: "off" });
    if (lights.some((d) => d.on && d.effect === "colorloop")) chips.push({ label: "Party mode", tone: "on" });
  }
  for (const t of of("thermostat")) {
    if (t.temperature !== undefined) chips.push({ label: `${Math.round(t.temperature)}°`, tone: t.on ? "on" : "off" });
  }
  const locks = of("lock");
  if (locks.length) {
    const open = locks.filter((d) => !d.locked).length;
    chips.push(open ? { label: `${open} unlocked`, tone: "warn" } : { label: "Locked", tone: "good" });
  }
  const blinds = of("blinds");
  if (blinds.length) {
    const open = blinds.filter((d) => d.on);
    chips.push(
      open.length
        ? { label: open.length === 1 && blinds.length === 1 ? `Blinds ${open[0].level ?? 100}%` : `${open.length} blinds open`, tone: "on" }
        : { label: "Blinds closed", tone: "off" },
    );
  }
  const fans = of("fan").filter((d) => d.on).length;
  if (fans) chips.push({ label: fans === 1 ? "Fan on" : `${fans} fans on`, tone: "on" });
  const media = of("media").filter((d) => d.on).length;
  if (media) chips.push({ label: media === 1 ? "Media on" : `${media} media on`, tone: "on" });
  return chips;
}

function speakerSummary(zones: SonosZone[]): SummaryChip[] {
  const playing = zones.filter((z) => z.playback === "playing");
  if (!playing.length) return [{ label: "Nothing playing", tone: "off" }];
  return playing.map((z) => ({
    label: z.track ? `${z.name}: ${z.track.title}${z.track.artist ? ` — ${z.track.artist}` : ""}` : `${z.name} playing`,
    tone: "on",
  }));
}

function toggleDevice(d: Device): Partial<Device> {
  if (d.type === "lock") return { locked: !d.locked, on: !d.locked };
  if (d.type === "blinds") return { on: !d.on, level: d.on ? 0 : 100 };
  if (d.type === "fan") return { on: !d.on, intensity: d.on ? 0 : 60 };
  return { on: !d.on };
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // ignore
  }
}

export default function App() {
  const [home, setHome] = useState<HomeState | null>(null);
  const [zones, setZones] = useState<SonosZone[]>([]);
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [detailZoneId, setDetailZoneId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthLoaded, setHealthLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<{ stop: () => void } | null>(null);
  const [result, setResult] = useState<CommandResponse | null>(null);
  const [reply, setReply] = useState<{
    text: string;
    error?: boolean;
    meta?: string;
    /** A follow-up question: the original request and the answers to pick from. */
    clarify?: { request: string; options: ClarifyOption[] };
  } | null>(null);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const [showScenes, setShowScenes] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Collapsible + reorderable sections (persisted)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(readStorage<string[]>("aura.collapsed", [])));
  const [order, setOrder] = useState<string[]>(() => readStorage<string[]>("aura.order", []));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("aura.inspector") !== "closed";
    } catch {
      return true;
    }
  });

  function toggleInspector() {
    setInspectorOpen((o) => {
      const next = !o;
      writeStorage("aura.inspector", next ? "open" : "closed");
      return next;
    });
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStorage("aura.collapsed", [...next]);
      return next;
    });
  }

  const loadAll = () => {
    fetchHome().then(setHome).catch(() => setHome(null));
    fetchZones().then(setZones).catch(() => setZones([]));
    fetchStations().then(setStations).catch(() => setStations([]));
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setHealthLoaded(true));
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Smoothly advance the progress bar for playing zones.
  useEffect(() => {
    const id = window.setInterval(() => {
      setZones((zs) =>
        zs.map((z) =>
          z.playback === "playing" && z.duration ? { ...z, elapsed: Math.min(z.duration, (z.elapsed ?? 0) + 1) } : z,
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

  const realDevices = Boolean(health && health.gateway !== "sim");
  const pendingDevices = useRef(new Map<string, { device: Device; patch: DevicePatch }>());
  const pendingTimer = useRef<number | undefined>(undefined);

  // zoneId -> roomId whose lights follow that zone's album art.
  const [lightSync, setLightSyncState] = useState<Record<string, string>>({});
  useEffect(() => {
    if (realDevices) fetchLightSync().then(setLightSyncState).catch(() => {});
  }, [realDevices]);

  function onLightSync(zoneId: string, roomId: string | null) {
    updateLightSync(zoneId, roomId)
      .then(setLightSyncState)
      .catch((e) => showError(e, "Couldn't change light sync."));
  }

  const [patterns, setPatterns] = useState<RunningPattern[]>([]);

  // Real device backends change outside Aura too (e.g. the Hue app).
  useEffect(() => {
    if (!realDevices) return;
    const refresh = () => {
      fetchHome().then(setHome).catch(() => {});
      fetchPatterns().then(setPatterns).catch(() => {});
    };
    refresh();
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [realDevices]);

  function onStartPattern(room: string, kind: PatternKind) {
    // Blink and alternate reuse the room's current light colors when it has some.
    const colors = [
      ...new Set(
        (home?.devices ?? [])
          .filter((d) => d.room === room && d.type === "light" && d.on && d.colorMode === "color" && d.color)
          .map((d) => d.color!),
      ),
    ];
    startPattern(room, kind, kind === "alternate" && colors.length < 2 ? undefined : colors)
      .then(setPatterns)
      .catch((e) => showError(e, "Couldn't start that pattern."));
  }

  function onStopPattern(room: string) {
    stopPattern(room)
      .then((list) => {
        setPatterns(list);
        window.setTimeout(() => fetchHome().then(setHome).catch(() => {}), 600);
      })
      .catch((e) => showError(e, "Couldn't stop the pattern."));
  }

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

  const showError = (e: unknown, fallback: string) =>
    setReply({ text: e instanceof Error ? e.message : fallback, error: true });

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
      showError(e, "Couldn't play that favorite.");
    }
    fetchQueue(detailZoneId).then(setQueue).catch(() => {});
  }

  async function onPlaySpotifyTrack(uri: string, title: string, mode: "now" | "end" = "now") {
    if (!detailZoneId) return;
    const zid = detailZoneId;
    try {
      setZones(await playSpotify(zid, uri, title, mode));
    } catch (e) {
      showError(e, "Couldn't play that track.");
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
      showError(e, "Couldn't play that station.");
    }
    fetchQueue(detailZoneId).then(setQueue).catch(() => {});
  }

  async function onToggleSpeakerGroup(targetZoneId: string) {
    if (!detailZoneId) return;
    const current = zones.find((z) => z.id === detailZoneId);
    const target = zones.find((z) => z.id === targetZoneId);
    if (!current || !target) return;
    try {
      setZones(
        current.groupedWith.includes(target.name)
          ? await ungroupZone(targetZoneId)
          : await groupZones(detailZoneId, [targetZoneId]),
      );
    } catch (e) {
      showError(e, "Couldn't change grouping.");
      fetchZones().then(setZones).catch(() => {});
    }
  }

  const status = useMemo(() => {
    if (!home) return { on: 0, temp: 0, locks: 0, unlocked: 0 };
    const lights = home.devices.filter((d) => d.type === "light");
    const on = lights.filter((d) => d.on).length;
    const thermos = home.devices.filter((d) => d.type === "thermostat" && d.temperature !== undefined);
    const temp = thermos.length
      ? Math.round(thermos.reduce((s, d) => s + (d.temperature ?? 0), 0) / thermos.length)
      : 0;
    const locks = home.devices.filter((d) => d.type === "lock");
    const unlocked = locks.filter((d) => !d.locked).length;
    return { on, temp, locks: locks.length, unlocked };
  }, [home]);

  const activeZonesCount = useMemo(() => zones.filter((z) => z.playback === "playing").length, [zones]);

  const byRoom = useMemo(() => {
    const map = new Map<string, Device[]>();
    if (home) {
      for (const d of home.devices) {
        const list = map.get(d.room) ?? [];
        list.push(d);
        map.set(d.room, list);
      }
    }
    return map;
  }, [home]);

  function flash(ids: string[]) {
    setFlashing(new Set(ids));
    window.setTimeout(() => setFlashing(new Set()), 1200);
  }

  // Optimistic local update. The simulator only needs that (the edited home rides
  // along with the next /api/command); real gateways also get the change pushed.
  function patchDevices(changes: { device: Device; patch: DevicePatch }[]) {
    const byId = new Map(changes.map(({ device, patch: { alert, ...state } }) => [device.id, state]));
    setHome((h) => (h ? { ...h, devices: h.devices.map((x) => (byId.has(x.id) ? { ...x, ...byId.get(x.id) } : x)) } : h));
    if (!realDevices || changes.length === 0) return;
    // Sliders fire continuously; coalesce changes per device before hitting the bridge.
    for (const { device, patch } of changes) {
      const prev = pendingDevices.current.get(device.id);
      pendingDevices.current.set(device.id, { device, patch: { ...prev?.patch, ...patch } });
    }
    window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(flushDevices, 150);
  }

  function flushDevices() {
    const actions: DeviceAction[] = [...pendingDevices.current.values()].map(({ device, patch }) => ({
      deviceId: device.id,
      deviceName: device.name,
      room: device.room,
      summary: `${device.name} updated`,
      patch,
    }));
    pendingDevices.current.clear();
    sendDeviceActions(actions);
  }

  function sendDeviceActions(actions: DeviceAction[]) {
    controlDevices(actions)
      .then(setHome)
      .catch((e) => {
        showError(e, "Couldn't update that device.");
        fetchHome().then(setHome).catch(() => {});
      });
  }

  function activateScene(scene: LightScene) {
    sendDeviceActions([{ deviceId: scene.id, deviceName: scene.name, room: scene.room ?? "", summary: scene.name, patch: {} }]);
  }

  function patchDevice(id: string, patch: DevicePatch) {
    const device = home?.devices.find((d) => d.id === id);
    if (device) patchDevices([{ device, patch }]);
  }

  function onManualToggle(d: Device) {
    patchDevice(d.id, toggleDevice(d));
  }

  function onDeviceUpdate(d: Device, patch: DevicePatch) {
    patchDevice(d.id, patch);
  }

  // Room quick action: turn every non-lock device in the room on/off.
  function onRoomQuickAction(roomId: string) {
    if (!home) return;
    const roomDevs = home.devices.filter((d) => d.room === roomId && d.type !== "lock");
    const target = !roomDevs.some((d) => d.on);
    patchDevices(roomDevs.map((device) => ({ device, patch: { on: target } })));
  }

  // Voice input via the browser's built-in speech recognition.
  function toggleVoice() {
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecog;
      webkitSpeechRecognition?: new () => SpeechRecog;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setReply({ text: "Voice input isn't supported in this browser — try Chrome.", error: true });
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => setReply({ text: "Listening… speak your command" });
    rec.onresult = (e: SpeechResultEvent) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
        void submit(text);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      const code = e?.error || "Unknown error";
      const messages: Record<string, string> = {
        "no-speech": "No speech detected. Try speaking louder or closer to the mic.",
        network: "Network error. Check your connection.",
        "not-allowed": "Microphone access denied. Check browser permissions.",
        "permission-denied": "Microphone access denied. Check browser permissions.",
        "audio-capture": "No microphone found. Check your device.",
      };
      setReply({ text: messages[code] || `Voice error: ${code}`, error: true });
    };
    recogRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function submit(text: string, overrides?: Record<string, string>) {
    if (!home || !text.trim() || loading) return;
    // Answering a follow-up by typing or saying one of the options ("the kitchen").
    const pending = reply?.clarify;
    const said = text.trim().toLowerCase();
    // Short replies only, so a new full command isn't mistaken for an answer.
    if (pending && !overrides && said.split(/\s+/).length <= 3) {
      const match = pending.options.find((o) => said.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(said));
      if (match) return submit(pending.request, match.overrides);
    }
    setLoading(true);
    setReply(null);
    try {
      const res = await sendCommand(text.trim(), home, overrides);
      setResult(res);
      if (res.patterns) setPatterns(res.patterns);
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
      setReply({
        text: res.reply,
        meta,
        ...(res.clarify ? { clarify: { request: text.trim(), options: res.clarify.options } } : {}),
      });
      setInput("");
    } catch (err) {
      showError(err, "Something went wrong.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const sectionDefs = useMemo(() => {
    const defs: {
      id: string;
      title: string;
      subtitle: string;
      summary: SummaryChip[];
      quickAction?: () => void;
      render: () => ReactNode;
    }[] = [];

    if (zones.length > 0) {
      defs.push({
        id: "speakers",
        title: "Speakers",
        subtitle: `Sonos · ${zones.length} ${zones.length === 1 ? "zone" : "zones"}`,
        summary: speakerSummary(zones),
        render: () => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
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
          subtitle: `${devices.length} ${devices.length === 1 ? "device" : "devices"}`,
          summary: [
            ...patterns
              .filter((p) => p.room === room.id || p.room === "all")
              .map((p): SummaryChip => ({ label: p.label, tone: "on" })),
            ...roomSummary(devices),
          ],
          quickAction: () => onRoomQuickAction(room.id),
          render: () => {
            const scenes = (home.scenes ?? []).filter((s) => s.room === room.id);
            const running = patterns.find((p) => p.room === room.id || p.room === "all");
            const hasColorLights = devices.some((d) => d.type === "light" && d.supportsColor && d.available !== false);
            return (
              <>
                {realDevices && hasColorLights && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {running ? (
                      <>
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/40 text-xs font-semibold text-fuchsia-300">
                          <Waves className="w-3.5 h-3.5 animate-pulse" />
                          {running.label}
                          {running.room === "all" ? " (whole house)" : ""}
                        </span>
                        <button
                          onClick={() => onStopPattern(running.room)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-white transition"
                        >
                          <Square className="w-3 h-3 fill-current" /> Stop
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] uppercase font-bold tracking-wider text-neutral-500 mr-1">Patterns</span>
                        {PATTERN_BUTTONS.map((p) => (
                          <button
                            key={p.kind}
                            onClick={() => onStartPattern(room.id, p.kind)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 hover:border-fuchsia-500/40 text-xs font-medium text-neutral-300 hover:text-white transition"
                          >
                            <span>{p.icon}</span>
                            {p.label}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {scenes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {scenes.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => activateScene(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 hover:border-amber-500/40 text-xs font-medium text-neutral-300 hover:text-white transition"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                  {devices.map((d) => (
                    <DeviceCard
                      key={d.id}
                      device={d}
                      flash={flashing.has(d.id)}
                      onToggle={onManualToggle}
                      onUpdate={onDeviceUpdate}
                    />
                  ))}
                </div>
              </>
            );
          },
        });
      }
    }
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, zones, stations, byRoom, flashing, detailZoneId, patterns, realDevices]);

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
    writeStorage("aura.order", ids);
  }

  const detailZone = detailZoneId ? zones.find((z) => z.id === detailZoneId) : undefined;

  return (
    <div className="min-h-screen lg:h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <Topbar
        status={status}
        activeZonesCount={activeZonesCount}
        health={health}
        healthLoaded={healthLoaded}
        inspectorOpen={inspectorOpen}
        onToggleInspector={toggleInspector}
        onOpenSettings={() => setShowSettings(true)}
        onOpenScenes={() => setShowScenes((s) => !s)}
      />

      {!inspectorOpen && (
        <button
          onClick={toggleInspector}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-300 hover:text-white shadow-2xl backdrop-blur-md transition group"
          title="Open decision trace"
        >
          <Activity className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-semibold">Decision Trace</span>
          {result && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
        </button>
      )}

      <div className="flex-1 flex flex-col lg:flex-row lg:min-h-0 lg:overflow-hidden">
        <main className="flex-1 lg:overflow-y-auto px-4 sm:px-8 py-6">
          <div className="max-w-7xl mx-auto w-full">
            {healthLoaded && !health && (
              <div className="mb-6 p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-sm text-rose-200">
                Can't reach the Aura server. Start it with <code className="font-mono">npm run dev</code> and reload.
              </div>
            )}
            {health && !health.typesafe && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-sm text-amber-200">
                No <code className="font-mono">TYPESAFE_API_KEY</code> found. Add it to <code className="font-mono">.env</code> and
                restart the server to enable natural-language control.
              </div>
            )}

            {showScenes && (
              <QuickScenes
                onSelectScene={(cmd) => {
                  setInput(cmd);
                  void submit(cmd);
                }}
                onClose={() => setShowScenes(false)}
              />
            )}

            {/* Natural-language + voice command */}
            <div className="relative mb-8 rounded-3xl p-5 sm:p-7 bg-gradient-to-b from-neutral-900/90 via-neutral-900/60 to-neutral-950 border border-neutral-800/80 shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-1/3 -z-10 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 mb-3.5">
                <div className="relative flex-1 flex items-center">
                  <input
                    ref={inputRef}
                    value={input}
                    placeholder="Tell Aura what to do… e.g. “dim the living room and lock the doors”"
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submit(input)}
                    className="w-full pl-4 pr-12 py-3.5 rounded-2xl bg-neutral-950/80 border border-neutral-700/70 focus:border-amber-500 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-inner transition"
                  />
                  <button
                    onClick={toggleVoice}
                    className={`absolute right-2 p-2 rounded-xl transition ${
                      listening
                        ? "bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/40"
                        : "hover:bg-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                    aria-label={listening ? "Stop listening" : "Speak a command"}
                    title={listening ? "Listening… tap to stop" : "Speak a command"}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>

                <button
                  disabled={loading || !input.trim() || !home}
                  onClick={() => void submit(input)}
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-neutral-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send</span>
                    </>
                  )}
                </button>
              </div>

              {listening && (
                <div className="flex items-center gap-2 mb-3 text-xs text-rose-300 font-medium px-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span>Listening… speak your command</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mr-1">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.cmd}
                    onClick={() => {
                      setInput(ex.cmd);
                      void submit(ex.cmd);
                    }}
                    disabled={loading || !home}
                    title={ex.cmd}
                    className="px-3 py-1.5 rounded-xl bg-neutral-950/60 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-xs text-neutral-300 hover:text-white transition disabled:opacity-50"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              {reply && (
                <div
                  className={`mt-4 p-4 rounded-2xl border flex items-start gap-3.5 ${
                    reply.error ? "bg-rose-950/30 border-rose-500/40 text-rose-200" : "bg-neutral-950/80 border-amber-500/30 text-neutral-200"
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${reply.error ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"}`}>
                    {reply.error ? <AlertCircle className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-relaxed">{reply.text}</p>
                    {reply.clarify && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {reply.clarify.options.map((o) => (
                          <button
                            key={o.label}
                            onClick={() => submit(reply.clarify!.request, o.overrides)}
                            disabled={loading}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-sm font-semibold text-amber-200 capitalize transition disabled:opacity-50"
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {reply.meta && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-neutral-400 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{reply.meta}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {orderedSections.map((sec) => (
                <Section
                  key={sec.id}
                  title={sec.title}
                  subtitle={sec.subtitle}
                  summary={sec.summary}
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
                  onQuickAction={sec.quickAction}
                  quickActionLabel={sec.quickAction ? "Toggle room" : undefined}
                >
                  {sec.render()}
                </Section>
              ))}
            </div>
          </div>
        </main>

        {inspectorOpen && <Inspector result={result} onCollapse={toggleInspector} />}
      </div>

      {detailZone && (
        <ZoneDetail
          zone={detailZone}
          queue={queue}
          stations={stations}
          allZones={zones}
          spotifyEnabled={Boolean(health?.spotify)}
          groupingSupported={health?.sonos !== "direct"}
          onClose={() => setDetailZoneId(null)}
          onControl={(action, value, station) => onZoneControl(detailZone.id, action, value, station)}
          onQueue={onQueueControl}
          onPlayFavorite={onPlayFavorite}
          onPlaySpotify={onPlaySpotifyTrack}
          onPlayRadio={onPlayRadioStation}
          onToggleGroup={onToggleSpeakerGroup}
          lightRooms={
            realDevices && home
              ? home.rooms.filter((r) => home.devices.some((d) => d.room === r.id && d.type === "light" && d.supportsColor))
              : []
          }
          lightSyncRoom={lightSync[detailZone.id]}
          onLightSync={(roomId) => onLightSync(detailZone.id, roomId)}
        />
      )}

      {showSettings && (
        <SettingsModal health={health} onClose={() => setShowSettings(false)} onRefresh={loadAll} />
      )}
    </div>
  );
}
