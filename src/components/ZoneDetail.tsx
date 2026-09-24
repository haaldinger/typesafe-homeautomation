import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { EqState, Favorite, QueueTrack, RadioStation, Room, SonosZone, SpotifyResult } from "../../shared/types.ts";
import {
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Radio,
  Music2,
  ListMusic,
  SlidersHorizontal,
  Trash2,
  Users,
  Headphones,
  Star,
  Search,
  Plus,
  MicVocal,
  Lightbulb,
  Sparkles,
  ListPlus,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import {
  fetchEq,
  fetchFavorites,
  fetchLyrics,
  fetchSuggestions,
  searchRadio,
  searchSpotify,
  setEq,
  type Lyrics,
  type StationInfo,
} from "../api.ts";
import { coverStyle, fmtTime } from "../format.ts";

type Tab = "queue" | "radio" | "favorites" | "spotify" | "similar" | "lyrics" | "eq" | "group";

interface ZoneDetailProps {
  zone: SonosZone;
  queue: QueueTrack[];
  stations: StationInfo[];
  allZones: SonosZone[];
  spotifyEnabled: boolean;
  /** False when the backend's Sonos mode can't change grouping (direct mode). */
  groupingSupported: boolean;
  onClose: () => void;
  onControl: (action: string, value?: number, station?: string) => void;
  onQueue: (op: "play" | "remove", position: number) => void;
  onPlayFavorite: (id: string) => void;
  onPlaySpotify: (uri: string, title: string, mode?: "now" | "end") => void | Promise<void>;
  onPlayRadio: (url: string, name: string) => void;
  onToggleGroup: (targetZoneId: string) => void;
  /** Rooms with color lights that can follow this zone's album art (empty hides the control). */
  lightRooms: Room[];
  lightSyncRoom?: string;
  onLightSync: (roomId: string | null) => void;
}

function Empty({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`text-center py-10 text-xs ${error ? "text-rose-300" : "text-neutral-500"}`}>{children}</div>
  );
}

function Thumb({ src, seed, icon }: { src?: string; seed: string; icon: ReactNode }) {
  return (
    <span
      className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center text-white/70"
      style={src ? undefined : coverStyle(seed)}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      ) : (
        icon
      )}
    </span>
  );
}

export function ZoneDetail({
  zone,
  queue,
  stations,
  allZones,
  spotifyEnabled,
  groupingSupported,
  onClose,
  onControl,
  onQueue,
  onPlayFavorite,
  onPlaySpotify,
  onPlayRadio,
  onToggleGroup,
  lightRooms,
  lightSyncRoom,
  onLightSync,
}: ZoneDetailProps) {
  const [tab, setTab] = useState<Tab>("queue");
  // Side panel (queue, radio, Spotify…) can be hidden for a wall-panel now-playing view. Wide screens only.
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem("aura.detailPanel") !== "closed";
    } catch {
      return true;
    }
  });
  function togglePanel() {
    setPanelOpen((open) => {
      try {
        localStorage.setItem("aura.detailPanel", open ? "closed" : "open");
      } catch {
        // Preference just won't persist.
      }
      return !open;
    });
  }
  const isPlaying = zone.playback === "playing";
  const track = zone.track;
  const pct = zone.duration ? Math.min(100, ((zone.elapsed ?? 0) / zone.duration) * 100) : 0;

  // Favorites
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  // Spotify search
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<SpotifyResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  // Radio search
  const [radioQ, setRadioQ] = useState("");
  const [radioResults, setRadioResults] = useState<RadioStation[]>([]);
  const [radioSearching, setRadioSearching] = useState(false);
  const [radioErr, setRadioErr] = useState<string | null>(null);
  const [radioSearched, setRadioSearched] = useState(false);
  // Lyrics
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  // EQ
  const [eq, setEqState] = useState<EqState | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetchFavorites().then(setFavorites);
  }, []);

  useEffect(() => {
    if (tab !== "eq") return;
    fetchEq(zone.id).then(setEqState).catch(() => setEqState(null));
  }, [tab, zone.id]);

  const trackKey = `${track?.artist}|${track?.title}`;
  // Loaded whenever the song changes: the Lyrics tab and the live line under the title share it.
  useEffect(() => {
    if (!track || track.artist === "Radio") {
      setLyrics(null);
      return;
    }
    let cancelled = false;
    setLyricsLoading(true);
    setLyrics(null);
    fetchLyrics(track.artist, track.title, zone.duration ?? 0)
      .then((l) => !cancelled && setLyrics(l))
      .catch(() => !cancelled && setLyrics(null))
      .finally(() => !cancelled && setLyricsLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);

  // "More like this", refreshed when the song changes.
  const [similar, setSimilar] = useState<SpotifyResult[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarErr, setSimilarErr] = useState<string | null>(null);
  const [queueingAll, setQueueingAll] = useState(false);
  const canSuggest = Boolean(track?.artist && track.artist !== "Radio");
  useEffect(() => {
    if (tab !== "similar" || !track || !canSuggest) return;
    let cancelled = false;
    setSimilarLoading(true);
    setSimilarErr(null);
    fetchSuggestions(track.artist, track.title)
      .then((s) => !cancelled && setSimilar(s))
      .catch((e) => !cancelled && setSimilarErr(e instanceof Error ? e.message : "Couldn't find similar songs"))
      .finally(() => !cancelled && setSimilarLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, trackKey]);

  async function queueAll() {
    setQueueingAll(true);
    try {
      for (const s of similar) await onPlaySpotify(s.uri, `${s.name} — ${s.artist}`, "end");
    } finally {
      setQueueingAll(false);
    }
  }

  const activeLine = useMemo(() => {
    if (!lyrics?.synced.length) return -1;
    const t = zone.elapsed ?? 0;
    let idx = -1;
    for (let i = 0; i < lyrics.synced.length; i++) {
      if (lyrics.synced[i].time <= t) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, zone.elapsed]);

  // The line being sung right now and the one after it, for the live display under the title.
  const liveLine = activeLine >= 0 ? lyrics!.synced[activeLine].text.trim() || "♪" : null;
  const nextLine = activeLine >= 0 ? lyrics!.synced[activeLine + 1]?.text.trim() || null : null;

  const activeLineRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLine]);

  async function changeEq(field: keyof EqState, value: number | boolean) {
    setEqState((cur) => (cur ? { ...cur, [field]: value } : cur));
    try {
      setEqState(await setEq(zone.id, field, value));
    } catch {
      fetchEq(zone.id).then(setEqState).catch(() => {});
    }
  }

  async function runSearch() {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr(null);
    try {
      setResults(await searchSpotify(q));
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function runRadio() {
    const q = radioQ.trim();
    if (!q) return;
    setRadioSearching(true);
    setRadioErr(null);
    try {
      setRadioResults(await searchRadio(q));
    } catch (e) {
      setRadioErr(e instanceof Error ? e.message : "Radio search failed");
      setRadioResults([]);
    } finally {
      setRadioSearching(false);
      setRadioSearched(true);
    }
  }

  const stationsByCategory = useMemo(() => {
    const map = new Map<string, StationInfo[]>();
    for (const s of stations) {
      const cat = s.category || "Stations";
      const list = map.get(cat) ?? [];
      list.push(s);
      map.set(cat, list);
    }
    return [...map.entries()];
  }, [stations]);

  const otherZones = allZones.filter((z) => z.id !== zone.id);
  const showGroupTab = groupingSupported && otherZones.length > 0;

  const tabs: { id: Tab; label: string; icon: ReactNode; accent?: string }[] = [
    { id: "queue", label: `Up Next (${queue.length})`, icon: <ListMusic className="w-3.5 h-3.5" /> },
    { id: "radio", label: "Radio", icon: <Radio className="w-3.5 h-3.5" /> },
    { id: "favorites", label: "Favorites", icon: <Star className="w-3.5 h-3.5" /> },
    { id: "spotify", label: "Spotify", icon: <Music2 className="w-3.5 h-3.5 text-emerald-400" />, accent: "emerald" },
    ...(spotifyEnabled
      ? [{ id: "similar" as Tab, label: "Similar", icon: <Sparkles className="w-3.5 h-3.5 text-emerald-400" />, accent: "emerald" }]
      : []),
    { id: "lyrics", label: "Lyrics", icon: <MicVocal className="w-3.5 h-3.5" /> },
    { id: "eq", label: "Sound", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    ...(showGroupTab
      ? [{ id: "group" as Tab, label: "Group", icon: <Users className="w-3.5 h-3.5 text-blue-400" />, accent: "blue" }]
      : []),
  ];

  const tabClass = (t: (typeof tabs)[number]) => {
    if (tab !== t.id) return "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 border border-transparent";
    if (t.accent === "emerald") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
    if (t.accent === "blue") return "bg-blue-500/20 text-blue-300 border border-blue-500/40";
    return "bg-amber-500/20 text-amber-300 border border-amber-500/40";
  };

  const inputClass =
    "flex-1 min-w-0 px-3.5 py-2 touch:min-h-11 rounded-xl bg-neutral-900 border border-neutral-800 text-base sm:text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60";
  const goClass =
    "shrink-0 px-3 py-2 touch:min-h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-xs font-semibold text-white flex items-center gap-1.5 transition";
  const rowClass =
    "group flex items-center justify-between gap-3 p-2.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800/80 transition";

  // Collapsed ("wall panel") layout only applies from md up; phones always stack now playing over the tabs.
  const wide = !panelOpen;
  const iconBtn =
    "p-2 touch:min-w-11 touch:min-h-11 flex items-center justify-center rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700 transition";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:py-6 sm:px-[max(1.5rem,env(safe-area-inset-left),env(safe-area-inset-right))] bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${zone.name} speaker`}
        className={`relative w-full h-dvh sm:h-auto sm:max-h-[92dvh] flex flex-col sm:rounded-3xl bg-neutral-950 sm:border border-neutral-800 shadow-2xl overflow-hidden ${
          panelOpen ? "max-w-4xl lg:h-[min(92dvh,52rem)]" : "max-w-4xl lg:max-w-5xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 right-1/4 -z-10 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-6 short:sm:py-4 border-b border-neutral-800/80 bg-neutral-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white tracking-tight truncate">{zone.name}</h2>
              <p className="text-xs text-neutral-400 font-medium truncate">
                {zone.groupedWith.length > 0 ? `Grouped with ${zone.groupedWith.join(" · ")}` : "Sonos zone"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {zone.groupedWith.length > 0 && groupingSupported && (
              <button
                onClick={() => onControl("ungroup")}
                className="px-3 py-1.5 touch:min-h-11 rounded-xl text-xs font-semibold border bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300 transition"
              >
                Ungroup
              </button>
            )}
            <button
              onClick={togglePanel}
              className={`hidden md:flex ${iconBtn}`}
              aria-label={panelOpen ? "Hide side panel" : "Show side panel"}
              aria-expanded={panelOpen}
              title={panelOpen ? "Hide side panel" : "Show queue, radio, Spotify…"}
            >
              {panelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
            <button onClick={onClose} className={iconBtn} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          data-zone-body
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${
            panelOpen ? "lg:grid lg:grid-cols-2 lg:overflow-hidden lg:divide-x lg:divide-neutral-800/80" : ""
          }`}
        >
          {/* Now playing */}
          <div
            className={`flex flex-col items-center gap-5 p-5 sm:p-6 ${
              panelOpen
                ? "lg:min-h-0 lg:overflow-y-auto lg:justify-center short:gap-4"
                : "md:flex-row md:gap-8 lg:gap-10 md:p-8 short:md:p-6 short:md:gap-6"
            }`}
          >
            <div
              className={`relative shrink-0 aspect-square rounded-2xl overflow-hidden shadow-2xl border border-neutral-700/60 group transition-all duration-300 ${
                panelOpen
                  ? "w-48 min-[400px]:w-56 sm:w-64 lg:w-56 xl:w-64 short:lg:w-44"
                  : "w-48 min-[400px]:w-56 sm:w-64 md:w-[min(22rem,calc(92dvh_-_11rem),38vw)] xl:w-[min(24rem,calc(92dvh_-_11rem))]"
              }`}
              style={zone.art ? undefined : coverStyle(track?.title ?? zone.name)}
            >
              {zone.art ? (
                <img
                  src={zone.art}
                  alt={track?.title ?? ""}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/60">
                  <Music2 className="w-16 h-16" />
                </div>
              )}
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[11px] font-semibold tracking-wide text-white border border-white/10 uppercase">
                {zone.playback}
              </div>
            </div>

            <div className={`w-full min-w-0 flex flex-col gap-4 text-center ${wide ? "md:flex-1 short:gap-3" : "short:gap-3"}`}>
              <div className="min-w-0">
                <h3 className={`font-bold text-white tracking-tight break-words ${wide ? "text-xl md:text-2xl short:text-xl" : "text-xl"}`}>
                  {track?.title || "Nothing playing"}
                </h3>
                <p className="text-sm text-neutral-400 font-medium mt-0.5 truncate">{track?.artist || "Pick a station or track"}</p>
                {track?.album && <p className="text-xs text-neutral-500 mt-0.5 truncate">{track.album}</p>}
                {liveLine && (
                  <div className={`mt-3 ${wide ? "md:mt-4 min-h-[3.5rem] md:min-h-[4.5rem] short:md:min-h-[3.5rem]" : "min-h-[3.5rem]"}`} aria-live="polite">
                    <p
                      key={activeLine}
                      className={`font-semibold text-amber-300 leading-snug line-clamp-2 animate-[fadeIn_0.4s_ease-out] ${
                        wide ? "text-base sm:text-lg md:text-2xl lg:text-3xl short:md:text-xl" : "text-base sm:text-lg"
                      }`}
                    >
                      {liveLine}
                    </p>
                    {nextLine && (
                      <p
                        className={`text-neutral-500 mt-1 leading-snug line-clamp-1 ${
                          wide ? "text-sm md:text-lg lg:text-xl short:md:text-base" : "text-sm"
                        }`}
                      >
                        {nextLine}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Progress (read-only: the backend has no seek action) */}
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-mono text-neutral-500">
                  <span>{fmtTime(zone.elapsed)}</span>
                  <span>{fmtTime(zone.duration)}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => onControl("previous")}
                  className="p-2.5 touch:min-w-12 touch:min-h-12 flex items-center justify-center rounded-xl hover:bg-neutral-900 text-neutral-400 hover:text-white transition"
                  title="Previous track"
                  aria-label="Previous track"
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onControl(isPlaying ? "pause" : "play")}
                  className="w-14 h-14 shrink-0 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center justify-center font-bold shadow-lg shadow-amber-500/30 transition transform hover:scale-105 active:scale-95 ring-4 ring-amber-400/20"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current translate-x-0.5" />}
                </button>
                <button
                  onClick={() => onControl("next")}
                  className="p-2.5 touch:min-w-12 touch:min-h-12 flex items-center justify-center rounded-xl hover:bg-neutral-900 text-neutral-400 hover:text-white transition"
                  title="Next track"
                  aria-label="Next track"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-3 w-full max-w-sm mx-auto">
                <span className="p-1 text-neutral-400 shrink-0">
                  {zone.volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={zone.volume}
                  onChange={(e) => onControl("set_volume", parseInt(e.target.value, 10))}
                  className="flex-1 min-w-0 accent-amber-500"
                  aria-label="Volume"
                />
                <span className="text-xs font-mono font-medium text-neutral-300 w-9 text-right shrink-0">{zone.volume}%</span>
              </div>

              {lightRooms.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400">
                    <Lightbulb className={`w-4 h-4 ${lightSyncRoom ? "text-fuchsia-400" : ""}`} />
                    <span id="light-sync-label">Lights follow the music</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-labelledby="light-sync-label">
                    {[{ id: "", name: "Off" }, ...lightRooms].map((r) => {
                      const active = (lightSyncRoom ?? "") === r.id;
                      return (
                        <button
                          key={r.id || "off"}
                          role="radio"
                          aria-checked={active}
                          onClick={() => onLightSync(r.id || null)}
                          className={`px-3 py-1 touch:min-h-11 touch:px-4 rounded-lg border text-xs font-semibold transition ${
                            active
                              ? r.id
                                ? "bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-200"
                                : "bg-neutral-800 border-neutral-600 text-white"
                              : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700"
                          }`}
                        >
                          {r.name}
                        </button>
                      );
                    })}
                  </div>
                  {lightSyncRoom && (
                    <p className="text-[11px] text-neutral-500">
                      {zone.art
                        ? "Recolors the lights that are on whenever the song changes."
                        : "Waiting for a song with album art — radio streams don't have any."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tabs (always shown on phones; the header button hides them from md up) */}
          <div
            className={`${panelOpen ? "flex" : "flex md:hidden"} flex-col lg:min-h-0 border-t lg:border-t-0 border-neutral-800/80 bg-neutral-950/40`}
          >
            <div
              className="sticky top-0 z-10 lg:static flex flex-nowrap lg:flex-wrap items-center gap-1.5 px-3 py-2.5 lg:p-3 border-b border-neutral-800/80 bg-neutral-950/95 backdrop-blur-md overflow-x-auto lg:overflow-visible no-scrollbar"
              role="tablist"
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 touch:min-h-11 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 ${tabClass(t)}`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            <div className="lg:flex-1 lg:min-h-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 lg:overflow-y-auto overscroll-contain space-y-3">
              {tab === "queue" &&
                (queue.length === 0 ? (
                  <Empty>
                    <ListMusic className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    Queue is empty. Pick a station from the Radio tab or search Spotify.
                  </Empty>
                ) : (
                  <div className="space-y-2">
                    {queue.map((item) => (
                      <div
                        key={`${item.position}-${item.title}`}
                        className={`${rowClass} ${item.current ? "border-amber-500/40 bg-amber-500/5" : ""}`}
                      >
                        <button
                          className="flex flex-1 items-center gap-3 min-w-0 text-left"
                          onClick={() => onQueue("play", item.position)}
                          title={`Play "${item.title || "this track"}" now`}
                        >
                          <span className="text-xs font-mono text-neutral-500 w-5 text-center">
                            {item.current && isPlaying ? <Play className="w-3 h-3 inline fill-amber-400 text-amber-400" /> : item.position}
                          </span>
                          <Thumb src={item.art} seed={item.title || String(item.position)} icon={<Music2 className="w-4 h-4" />} />
                          <span className="min-w-0">
                            <span className={`block text-sm font-medium truncate transition ${item.current ? "text-amber-300" : "text-white group-hover:text-amber-300"}`}>
                              {item.title || "Unknown"}
                            </span>
                            <span className="block text-xs text-neutral-400 truncate">{item.artist}</span>
                          </span>
                        </button>
                        <button
                          onClick={() => onQueue("remove", item.position)}
                          className="p-1.5 touch:min-w-11 touch:min-h-11 flex items-center justify-center rounded-lg hover:bg-rose-500/20 hover:text-rose-400 text-neutral-500 transition shrink-0"
                          aria-label="Remove from queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}

              {tab === "radio" && (
                <div className="space-y-4">
                  {stationsByCategory.map(([cat, list]) => (
                    <div key={cat}>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 mb-2">{cat}</div>
                      <div className="flex flex-wrap gap-2">
                        {list.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => onControl("play_station", undefined, s.id)}
                            className="px-3 py-1.5 touch:min-h-11 rounded-xl bg-neutral-900/70 hover:bg-neutral-800 border border-neutral-800 hover:border-amber-500/40 text-xs text-neutral-200 hover:text-amber-300 transition"
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 mb-2">Search all stations</div>
                    <div className="flex gap-2">
                      <input
                        value={radioQ}
                        placeholder="Search live radio (e.g. jazz, BBC, KEXP)…"
                        onChange={(e) => setRadioQ(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && runRadio()}
                        className={inputClass}
                      />
                      <button className={goClass} onClick={runRadio} disabled={radioSearching || !radioQ.trim()}>
                        <Search className="w-3.5 h-3.5" />
                        {radioSearching ? "…" : "Search"}
                      </button>
                    </div>
                  </div>
                  {radioErr && <Empty error>{radioErr}</Empty>}
                  {!radioErr && radioSearched && !radioSearching && radioResults.length === 0 && (
                    <Empty>No stations found. Try a different search.</Empty>
                  )}
                  <div className="space-y-2">
                    {radioResults.map((r) => (
                      <div key={r.id} className={rowClass}>
                        <div className="flex items-center gap-3 min-w-0">
                          <Thumb src={r.favicon} seed={r.name} icon={<Radio className="w-4 h-4" />} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{r.name}</p>
                            <p className="text-xs text-neutral-400 truncate">
                              {[r.country, r.codec, r.bitrate ? `${r.bitrate}k` : null].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => onPlayRadio(r.url, r.name)}
                          className="px-2.5 py-1 touch:min-h-11 touch:px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs transition flex items-center gap-1 shrink-0"
                        >
                          <Play className="w-3 h-3 fill-current" /> Play
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "favorites" &&
                (favorites.length === 0 ? (
                  <Empty>No saved Sonos favorites found.</Empty>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {favorites.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => onPlayFavorite(f.id)}
                        title={`Play ${f.title}`}
                        className="group p-2.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800 hover:border-amber-500/40 text-left transition"
                      >
                        <span
                          className="block aspect-square w-full rounded-lg overflow-hidden mb-2 bg-neutral-800 flex items-center justify-center text-white/70"
                          style={f.art ? undefined : coverStyle(f.title)}
                        >
                          {f.art ? <img src={f.art} alt="" className="w-full h-full object-cover" /> : <Star className="w-6 h-6" />}
                        </span>
                        <span className="block text-xs font-semibold text-white truncate group-hover:text-amber-300">{f.title}</span>
                        {f.description && <span className="block text-[11px] text-neutral-500 truncate">{f.description}</span>}
                      </button>
                    ))}
                  </div>
                ))}

              {tab === "spotify" &&
                (!spotifyEnabled ? (
                  <Empty>Spotify search isn't configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env.</Empty>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        value={searchQ}
                        placeholder="Search Spotify for a song or artist…"
                        onChange={(e) => setSearchQ(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && runSearch()}
                        className={inputClass.replace("focus:border-amber-500/60", "focus:border-emerald-500/60")}
                      />
                      <button className={goClass} onClick={runSearch} disabled={searching || !searchQ.trim()}>
                        <Search className="w-3.5 h-3.5" />
                        {searching ? "…" : "Search"}
                      </button>
                    </div>
                    {searchErr && <Empty error>{searchErr}</Empty>}
                    <div className="space-y-2">
                      {results.map((r) => (
                        <div key={r.id} className={rowClass}>
                          <div className="flex items-center gap-3 min-w-0">
                            <Thumb src={r.art} seed={r.name} icon={<Music2 className="w-4 h-4" />} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{r.name}</p>
                              <p className="text-xs text-neutral-400 truncate">
                                {r.artist} · {r.album}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => onPlaySpotify(r.uri, `${r.name} — ${r.artist}`, "end")}
                              className="p-1.5 touch:min-w-11 touch:min-h-11 flex items-center justify-center rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
                              title="Add to queue"
                              aria-label="Add to queue"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onPlaySpotify(r.uri, `${r.name} — ${r.artist}`, "now")}
                              className="px-2.5 py-1 touch:min-h-11 touch:px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-xs transition flex items-center gap-1"
                            >
                              <Play className="w-3 h-3 fill-current" /> Play
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

              {tab === "similar" &&
                (!canSuggest ? (
                  <Empty>Play a song to get suggestions. Radio streams don't say what's playing.</Empty>
                ) : similarLoading ? (
                  <Empty>Finding songs like {track?.artist}…</Empty>
                ) : similarErr ? (
                  <Empty error>{similarErr}</Empty>
                ) : similar.length === 0 ? (
                  <Empty>No similar songs found for {track?.artist}.</Empty>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-neutral-400 min-w-0 truncate">
                        Because you're playing <span className="text-neutral-200 font-medium">{track?.artist}</span>
                      </p>
                      <button
                        onClick={queueAll}
                        disabled={queueingAll}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 touch:min-h-11 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition disabled:opacity-50"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                        {queueingAll ? "Queueing…" : `Queue all ${similar.length}`}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {similar.map((r) => (
                        <div key={r.id} className={rowClass}>
                          <div className="flex items-center gap-3 min-w-0">
                            <Thumb src={r.art} seed={r.name} icon={<Music2 className="w-4 h-4" />} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{r.name}</p>
                              <p className="text-xs text-neutral-400 truncate">
                                {r.artist}
                                {r.reason ? <span className="text-neutral-500"> · {r.reason}</span> : null}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => onPlaySpotify(r.uri, `${r.name} — ${r.artist}`, "end")}
                              className="p-1.5 touch:min-w-11 touch:min-h-11 flex items-center justify-center rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
                              title="Add to queue"
                              aria-label="Add to queue"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onPlaySpotify(r.uri, `${r.name} — ${r.artist}`, "now")}
                              className="px-2.5 py-1 touch:min-h-11 touch:px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-xs transition flex items-center gap-1"
                            >
                              <Play className="w-3 h-3 fill-current" /> Play
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

              {tab === "lyrics" && (
                <>
                  {!track ? (
                    <Empty>Nothing playing.</Empty>
                  ) : lyricsLoading ? (
                    <Empty>Finding lyrics…</Empty>
                  ) : !lyrics ? (
                    <Empty>No lyrics found for this track.</Empty>
                  ) : lyrics.synced.length ? (
                    <ul className="space-y-2 py-4 text-center">
                      {lyrics.synced.map((l, i) => (
                        <li
                          key={i}
                          ref={i === activeLine ? activeLineRef : undefined}
                          className={`transition-all ${
                            i === activeLine
                              ? "text-lg font-bold text-amber-300"
                              : i < activeLine
                                ? "text-sm text-neutral-600"
                                : "text-sm text-neutral-400"
                          }`}
                        >
                          {l.text || " "}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-300 leading-relaxed">{lyrics.plain}</pre>
                  )}
                  {lyrics && <div className="text-[10px] text-neutral-600 text-right font-mono">source: {lyrics.source}</div>}
                </>
              )}

              {tab === "eq" && (
                <div className="space-y-4">
                  {(["bass", "treble"] as const).map((field) => (
                    <div key={field}>
                      <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                        <span className="font-semibold capitalize">{field}</span>
                        <span className="font-mono">{eq ? (eq[field] > 0 ? `+${eq[field]}` : eq[field]) : "…"}</span>
                      </div>
                      <input
                        type="range"
                        min={-10}
                        max={10}
                        value={eq?.[field] ?? 0}
                        disabled={!eq}
                        onChange={(e) => changeEq(field, Number(e.target.value))}
                        className="w-full accent-amber-500 disabled:opacity-40"
                        aria-label={field}
                      />
                    </div>
                  ))}
                  {(["night", "loudness"] as const).map((field) => {
                    const on = Boolean(eq?.[field]);
                    return (
                      <button
                        key={field}
                        disabled={!eq}
                        onClick={() => changeEq(field, !on)}
                        className="w-full flex items-center justify-between p-3 touch:min-h-12 rounded-xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 disabled:opacity-40 transition"
                        role="switch"
                        aria-checked={on}
                      >
                        <span className="text-xs font-semibold text-white">{field === "night" ? "Night mode" : "Loudness"}</span>
                        <span className={`relative w-9 h-5 rounded-full transition ${on ? "bg-amber-500" : "bg-neutral-700"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-4.5" : "left-0.5"}`} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {tab === "group" && (
                <div className="space-y-3">
                  <p className="text-xs text-neutral-400">
                    Group other zones with <strong className="text-neutral-200">{zone.name}</strong> to play in sync.
                  </p>
                  <div className="space-y-2">
                    {otherZones.map((other) => {
                      const isGrouped = zone.groupedWith.includes(other.name);
                      return (
                        <div key={other.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-900/60 border border-neutral-800">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{other.name}</p>
                            <p className="text-xs text-neutral-400 truncate">
                              {other.track ? `${other.track.title} · ${other.track.artist}` : other.playback}
                            </p>
                          </div>
                          <button
                            onClick={() => onToggleGroup(other.id)}
                            className={`px-3 py-1.5 touch:min-h-11 rounded-xl text-xs font-semibold border transition shrink-0 ${
                              isGrouped
                                ? "bg-blue-500/20 border-blue-500/40 text-blue-300 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300"
                                : "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-white"
                            }`}
                          >
                            {isGrouped ? "Ungroup" : "+ Group"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
