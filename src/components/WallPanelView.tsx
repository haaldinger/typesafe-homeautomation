import { useEffect, useState } from "react";
import type { Device, DevicePatch, FlightResponse, HomeState, SonosZone } from "../../shared/types.ts";
import {
  Lightbulb,
  Lock,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  Power,
  Radar,
  SkipBack,
  SkipForward,
  Thermometer,
  Tv,
  Unlock,
} from "lucide-react";
import { scenesFor } from "./QuickScenes.tsx";
import { AuraMark } from "./AuraMark.tsx";
import { kelvinToHex, LIGHT_COLORS } from "../../shared/color.ts";
import { coverStyle } from "../format.ts";

interface WallPanelViewProps {
  home: HomeState | null;
  zones: SonosZone[];
  flights: FlightResponse | null;
  status: { on: number; temp: number; locks: number; unlocked: number };
  aspect?: "square" | "rect-landscape" | "rect-portrait";
  onToggleDevice: (d: Device) => void;
  onUpdateDevice: (d: Device, patch: DevicePatch) => void;
  onZoneControl: (zoneId: string, action: string, value?: number, station?: string) => void;
  onRunScene: (command: string) => void;
}

const SWATCHES = Object.values(LIGHT_COLORS)
  .filter((c): c is { label: string; hex: string } => "hex" in c)
  .slice(0, 5);

export function WallPanelView({
  home,
  zones,
  flights,
  status,
  aspect = "square",
  onToggleDevice,
  onUpdateDevice,
  onZoneControl,
  onRunScene,
}: WallPanelViewProps) {
  const [tab, setTab] = useState<"glance" | "lights" | "audio" | "scenes" | "radar">("glance");
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = time.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const activeZone = zones.find((z) => z.playback === "playing") || zones[0];
  const isPlaying = activeZone?.playback === "playing";
  const isTv = Boolean(activeZone?.source?.toLowerCase().includes("tv") || activeZone?.source?.toLowerCase().includes("arc"));
  const scenes = scenesFor();
  const rooms = (home?.rooms ?? []).map((room) => ({
    room,
    lights: (home?.devices ?? []).filter((d) => d.room === room.id && d.type === "light"),
  }));
  const locked = status.locks > 0 && status.unlocked === 0;

  return (
    <div
      data-aspect={aspect}
      className="w-full h-full flex flex-col bg-[#05070a] text-white select-none overflow-hidden font-sans border border-white/[0.08] rounded-3xl shadow-2xl"
    >
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-[#0c1017] border-b border-white/[0.08]">
        <div className="flex items-center gap-3 min-w-0">
          <AuraMark size={32} className="rounded-xl shadow-md shadow-amber-500/20" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">{timeStr}</span>
              <span className="text-xs text-neutral-400 font-medium">{dateStr}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono">
              <span className={status.on > 0 ? "text-amber-400 font-semibold" : "text-neutral-500"}>{status.on} lights</span>
              <span aria-hidden="true" className="text-neutral-600">·</span>
              <span>{status.temp > 0 ? `${status.temp}°F` : "--"}</span>
              <span aria-hidden="true" className="text-neutral-600">·</span>
              <span className={status.unlocked > 0 ? "text-rose-400 font-semibold" : "text-emerald-400 font-semibold"}>
                {status.locks > 0 ? (locked ? "Locked" : `${status.unlocked} Open`) : "Secure"}
              </span>
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.06] overflow-x-auto no-scrollbar" aria-label="Wall panel views">
          {[
            ["glance", "Home"],
            ["lights", "Lights"],
            ["audio", "Music"],
            ["scenes", "Scenes"],
            ["radar", "Radar"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as typeof tab)}
              className={`min-h-11 min-w-[54px] px-3 rounded-xl text-xs font-bold transition-colors ${tab === id ? "bg-amber-500 text-neutral-950 shadow-md" : "text-neutral-300 hover:text-white hover:bg-white/[0.06]"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
        {tab === "glance" && (
          <div className="h-full flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <button type="button" onClick={() => setTab("lights")} className="p-3.5 rounded-2xl bg-[#0f141f] border border-white/[0.08] text-left min-h-20 flex flex-col justify-between tactile-button">
                <div className="flex items-center justify-between text-neutral-400"><Lightbulb className={`w-5 h-5 ${status.on > 0 ? "text-amber-400" : ""}`} /><span className="text-[10px] font-mono uppercase">Lights</span></div>
                <div><strong className="text-xl font-bold font-mono tabular-nums">{status.on} on</strong><span className="block text-[11px] text-neutral-400 truncate">Tap to control</span></div>
              </button>
              <div className="p-3.5 rounded-2xl bg-[#0f141f] border border-white/[0.08] min-h-20 flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400"><Thermometer className="w-5 h-5 text-emerald-400" /><span className="text-[10px] font-mono uppercase">Indoor</span></div>
                <div><strong className="text-xl font-bold font-mono tabular-nums">{status.temp > 0 ? `${status.temp}°F` : "--"}</strong><span className="block text-[11px] text-neutral-400">Average home</span></div>
              </div>
              <div className={`p-3.5 rounded-2xl border min-h-20 flex flex-col justify-between ${locked ? "bg-[#0f141f] border-white/[0.08]" : "bg-[#181116] border-rose-500/40"}`}>
                <div className="flex items-center justify-between text-neutral-400">{locked ? <Lock className="w-5 h-5 text-emerald-400" /> : <Unlock className="w-5 h-5 text-rose-400" />}<span className="text-[10px] font-mono uppercase">Security</span></div>
                <div><strong className={`text-xl font-bold ${!locked ? "text-rose-300" : ""}`}>{locked ? "Locked" : `${status.unlocked} Open`}</strong><span className="block text-[11px] text-neutral-400 truncate">All entries</span></div>
              </div>
            </div>
            {activeZone && (
              <div className="p-4 rounded-2xl bg-[#0f141f] border border-white/[0.08] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-white/[0.1]" style={activeZone.art ? undefined : coverStyle(activeZone.track?.title ?? activeZone.name)}>
                    {activeZone.art ? <img src={activeZone.art} alt="" className="w-full h-full object-cover" /> : isTv ? <div className="w-full h-full flex items-center justify-center text-sky-400 bg-sky-950/40"><Tv className="w-7 h-7" /></div> : <div className="w-full h-full flex items-center justify-center text-white/60"><Music2 className="w-7 h-7" /></div>}
                  </div>
                  <div className="min-w-0"><span className="text-[10px] font-mono uppercase font-bold text-amber-400 tracking-wider">{activeZone.name} {isTv ? "· TV ARC" : ""}</span><h4 className="text-base font-bold truncate">{activeZone.track?.title || (isTv ? "TV Audio" : "Nothing playing")}</h4><p className="text-xs text-neutral-400 truncate">{activeZone.track?.artist || activeZone.name}</p></div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => onZoneControl(activeZone.id, "previous")} className="w-12 h-12 min-w-11 rounded-xl bg-white/[0.06] flex items-center justify-center tactile-button" aria-label="Previous track"><SkipBack className="w-5 h-5" /></button>
                  <button type="button" onClick={() => onZoneControl(activeZone.id, isPlaying ? "pause" : "play")} className={`w-14 h-14 min-w-11 rounded-2xl flex items-center justify-center text-neutral-950 shadow-lg tactile-button ${isPlaying ? "bg-amber-500" : "bg-white"}`} aria-label={isPlaying ? "Pause playback" : "Play music"}>{isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}</button>
                  <button type="button" onClick={() => onZoneControl(activeZone.id, "next")} className="w-12 h-12 min-w-11 rounded-xl bg-white/[0.06] flex items-center justify-center tactile-button" aria-label="Next track"><SkipForward className="w-5 h-5" /></button>
                </div>
              </div>
            )}
            <div><span className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-2 block font-semibold">Quick Scenes</span><div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">{scenes.slice(0, 4).map((scene) => { const Icon = scene.icon; return <button type="button" key={scene.id} onClick={() => onRunScene(scene.command)} className={`min-h-[52px] p-3 rounded-2xl border text-left flex items-center gap-2.5 bg-gradient-to-br ${scene.color} tactile-button`}><Icon className="w-5 h-5 shrink-0" /><span className="text-xs font-bold truncate">{scene.name}</span></button>; })}</div></div>
          </div>
        )}

        {tab === "lights" && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">{rooms.map(({ room, lights }) => { const on = lights.some((light) => light.on); const colorable = lights.filter((light) => light.supportsColor && light.available !== false); return <section key={room.id} className="p-4 rounded-2xl bg-[#0f141f] border border-white/[0.08]"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className={`w-11 h-11 rounded-xl flex items-center justify-center ${on ? "bg-amber-500 text-neutral-950" : "bg-white/[0.06] text-neutral-400"}`}><Lightbulb className="w-5 h-5" /></div><div><h4 className="text-base font-bold">{room.name}</h4><span className="text-xs text-neutral-400 font-mono">{on ? `${lights.filter((light) => light.on).length} of ${lights.length} on` : "Off"}</span></div></div><button type="button" onClick={() => lights.forEach((light) => onToggleDevice({ ...light, on: !on }))} className={`w-12 h-12 min-w-11 rounded-xl flex items-center justify-center tactile-button ${on ? "bg-amber-500 text-neutral-950" : "bg-white/[0.06] text-neutral-400"}`} aria-label={`Toggle ${room.name} lights`}><Power className="w-5 h-5" /></button></div>{colorable.length > 0 && <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.05]">{SWATCHES.map((swatch) => <button type="button" key={swatch.hex} onClick={() => colorable.forEach((light) => onUpdateDevice(light, { on: true, color: swatch.hex, colorMode: "color" }))} className="flex-1 h-11 min-w-11 rounded-xl border border-white/20 tactile-button" style={{ backgroundColor: swatch.hex }} aria-label={`${room.name} ${swatch.label}`} />)}<button type="button" onClick={() => colorable.forEach((light) => onUpdateDevice(light, { on: true, kelvin: 2700, colorMode: "white" }))} className="flex-1 h-11 min-w-11 rounded-xl border border-white/20 text-[10px] font-mono text-neutral-900 font-bold" style={{ backgroundColor: kelvinToHex(2700) }}>2.7K</button></div>}</section>; })}</div>}

        {tab === "audio" && <div className="space-y-4">{zones.map((zone) => { const zonePlaying = zone.playback === "playing"; const zoneTv = Boolean(zone.source?.toLowerCase().includes("tv") || zone.source?.toLowerCase().includes("arc")); return <div key={zone.id} className="p-4 rounded-2xl bg-[#0f141f] border border-white/[0.08] flex flex-col gap-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3 min-w-0"><div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-white/[0.1]" style={zone.art ? undefined : coverStyle(zone.track?.title ?? zone.name)}>{zone.art ? <img src={zone.art} alt="" className="w-full h-full object-cover" /> : zoneTv ? <div className="w-full h-full flex items-center justify-center text-sky-400 bg-sky-950/40"><Tv className="w-6 h-6" /></div> : <div className="w-full h-full flex items-center justify-center text-white/60"><Music2 className="w-6 h-6" /></div>}</div><div className="min-w-0"><span className="text-[10px] font-mono uppercase font-bold text-amber-400">{zone.name} {zoneTv ? "· TV ARC" : ""}</span><h4 className="text-base font-bold truncate">{zone.track?.title || (zoneTv ? "TV Audio" : "Nothing playing")}</h4><p className="text-xs text-neutral-400 truncate">{zone.track?.artist || zone.name}</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => onZoneControl(zone.id, "previous")} className="w-11 h-11 min-w-11 rounded-xl bg-white/[0.06] flex items-center justify-center tactile-button" aria-label="Previous"><SkipBack className="w-4 h-4" /></button><button type="button" onClick={() => onZoneControl(zone.id, zonePlaying ? "pause" : "play")} className={`w-12 h-12 min-w-11 rounded-xl flex items-center justify-center text-neutral-950 tactile-button ${zonePlaying ? "bg-amber-500" : "bg-white"}`} aria-label={zonePlaying ? "Pause" : "Play"}>{zonePlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}</button><button type="button" onClick={() => onZoneControl(zone.id, "next")} className="w-11 h-11 min-w-11 rounded-xl bg-white/[0.06] flex items-center justify-center tactile-button" aria-label="Next"><SkipForward className="w-4 h-4" /></button></div></div><div className="flex items-center gap-3 pt-2 border-t border-white/[0.05]"><button type="button" onClick={() => onZoneControl(zone.id, "set_volume", Math.max(0, zone.volume - 5))} className="w-11 h-11 min-w-11 rounded-xl bg-white/[0.06] flex items-center justify-center tactile-button" aria-label="Volume down"><Minus className="w-4 h-4" /></button><div className="flex-1 flex items-center gap-2"><input type="range" min="0" max="100" value={zone.volume} onChange={(event) => onZoneControl(zone.id, "set_volume", Number(event.target.value))} className="w-full accent-amber-500 cursor-pointer" aria-label={`${zone.name} volume`} /><span className="w-10 text-right text-sm font-mono font-bold tabular-nums">{zone.volume}%</span></div><button type="button" onClick={() => onZoneControl(zone.id, "set_volume", Math.min(100, zone.volume + 5))} className="w-11 h-11 min-w-11 rounded-xl bg-white/[0.06] flex items-center justify-center tactile-button" aria-label="Volume up"><Plus className="w-4 h-4" /></button></div></div>; })}</div>}

        {tab === "scenes" && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{scenes.map((scene) => { const Icon = scene.icon; return <button type="button" key={scene.id} onClick={() => onRunScene(scene.command)} className={`min-h-[5.5rem] p-4 rounded-2xl border text-left flex flex-col justify-between bg-gradient-to-br ${scene.color} tactile-button`}><Icon className="w-6 h-6 mb-2" /><div><h4 className="text-base font-bold truncate">{scene.name}</h4><span className="text-xs text-neutral-300 line-clamp-1">"{scene.command}"</span></div></button>; })}</div>}

        {tab === "radar" && <div className="h-full flex flex-col items-center justify-center text-center p-4"><div className="wall-panel-radar-placeholder mb-4" aria-hidden="true"><span className="wall-panel-radar-placeholder__crosshair" /><span className="wall-panel-radar-placeholder__airport">LNS</span><Radar className="wall-panel-radar-placeholder__icon" /></div><h3 className="text-lg font-bold">{flights?.aircraft.length ?? 0} aircraft nearby</h3><p className="text-xs text-neutral-400 max-w-sm mt-1 mb-4">Real-time airspace telemetry centered on Lancaster (LNS).</p>{flights && flights.aircraft.length > 0 && <div className="w-full max-w-md space-y-2">{flights.aircraft.slice(0, 4).map((aircraft) => <div key={aircraft.id} className="flex items-center justify-between p-2.5 rounded-xl bg-[#0f141f] border border-white/[0.08] text-xs font-mono"><strong className="text-amber-400">{aircraft.callsign}</strong><span>{aircraft.type ?? "Aircraft"}</span><span className="text-neutral-400">{aircraft.altitudeFeet ? `${aircraft.altitudeFeet.toLocaleString()} ft` : "--"}</span><span className="text-sky-400">{aircraft.distanceNm ? `${aircraft.distanceNm} NM` : "--"}</span></div>)}</div>}</div>}
      </main>
    </div>
  );
}