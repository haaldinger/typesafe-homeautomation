import type { SonosZone } from "../../shared/types.ts";
import { Play, Pause, Volume2, VolumeX, Maximize2, Users, Disc3, SkipForward, SkipBack } from "lucide-react";
import { coverStyle, fmtTime } from "../format.ts";

interface ZoneCardProps {
  zone: SonosZone;
  flash?: boolean;
  onControl: (action: string, value?: number, station?: string) => void;
  onOpen: () => void;
}

export function ZoneCard({ zone, flash = false, onControl, onOpen }: ZoneCardProps) {
  const isPlaying = zone.playback === "playing";
  const track = zone.track;
  const progressPercent = zone.duration
    ? Math.min(100, Math.round(((zone.elapsed ?? 0) / zone.duration) * 100))
    : 0;

  return (
    <div
      className={`relative group overflow-hidden rounded-2xl border transition-all duration-300 ${
        flash ? "device-flashing ring-2 ring-amber-400" : ""
      } ${
        isPlaying
          ? "bg-gradient-to-b from-neutral-900 via-neutral-900/95 to-neutral-950 border-amber-500/40 shadow-xl shadow-black/60 ring-1 ring-amber-500/20"
          : "bg-neutral-900/60 hover:bg-neutral-900/80 border-neutral-800 hover:border-neutral-700/80 shadow-md shadow-black/40"
      }`}
    >
      {isPlaying && (
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -z-10 group-hover:bg-amber-500/15 transition-all" />
      )}

      {/* Header: zone name, group badge, expand */}
      <div className="p-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 className="text-base font-bold text-white tracking-tight truncate">{zone.name}</h3>
            {zone.groupedWith.length > 0 && (
              <span
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30"
                title={`Grouped with ${zone.groupedWith.join(", ")}`}
              >
                <Users className="w-2.5 h-2.5" />
                Grouped (+{zone.groupedWith.length})
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-400 font-medium truncate">
            {zone.groupedWith.length > 0 ? `with ${zone.groupedWith.join(" · ")}` : "Sonos zone"}
          </p>
        </div>

        <button
          onClick={onOpen}
          className="p-2 rounded-xl bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700/60 hover:border-neutral-600 transition shadow-sm"
          title="Open zone controller & queue"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Artwork + track info */}
      <div className="px-4 py-2 flex items-center gap-4">
        <div className="relative shrink-0 w-20 h-20">
          <div
            className={`absolute top-0 right-0 w-20 h-20 rounded-full bg-neutral-950 border-2 border-neutral-700/80 flex items-center justify-center shadow-lg transition-transform duration-500 ${
              isPlaying ? "translate-x-3 animate-vinyl" : "translate-x-0"
            }`}
          >
            <div className="w-14 h-14 rounded-full border border-neutral-800/80 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border border-neutral-800/80 flex items-center justify-center bg-amber-500/40">
                <div className="w-2 h-2 rounded-full bg-neutral-950" />
              </div>
            </div>
          </div>

          <div
            className="relative w-20 h-20 rounded-xl overflow-hidden shadow-xl border border-neutral-700/50 bg-neutral-800 z-10 group-hover:scale-105 transition-transform duration-300"
            style={zone.art ? undefined : coverStyle(track?.title ?? zone.name)}
          >
            {zone.art ? (
              <img src={zone.art} alt={track?.title ?? ""} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/60">
                <Disc3 className="w-8 h-8" />
              </div>
            )}

            {isPlaying && (
              <div className="absolute bottom-1.5 left-1.5 flex items-end gap-0.5 p-1 rounded bg-black/60 backdrop-blur-sm">
                <span className="w-1 h-3 bg-amber-400 rounded-full animate-eq-1" />
                <span className="w-1 h-2 bg-amber-400 rounded-full animate-eq-2" />
                <span className="w-1 h-4 bg-amber-400 rounded-full animate-eq-3" />
                <span className="w-1 h-2 bg-amber-400 rounded-full animate-eq-4" />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
              {zone.playback}
            </span>
          </div>

          <h4 className="text-sm font-semibold text-neutral-100 truncate group-hover:text-amber-300 transition">
            {track?.title || "Nothing playing"}
          </h4>
          <p className="text-xs text-neutral-400 truncate">{track?.artist || "Pick a station or track"}</p>

          {zone.duration ? (
            <div className="mt-2 space-y-1">
              <div className="h-1 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                <span>{fmtTime(zone.elapsed)}</span>
                <span>{fmtTime(zone.duration)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Transport + volume */}
      <div className="p-4 pt-3 mt-1 border-t border-neutral-800/80 bg-neutral-950/40 flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onControl("previous")}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            title="Previous track"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => onControl(isPlaying ? "pause" : "play")}
            className={`p-2.5 rounded-xl font-bold flex items-center justify-center transition shadow-md ${
              isPlaying
                ? "bg-amber-500 text-neutral-950 hover:bg-amber-400 shadow-amber-500/25 ring-2 ring-amber-400/40"
                : "bg-white text-neutral-950 hover:bg-neutral-200"
            }`}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-0.5" />}
          </button>

          <button
            onClick={() => onControl("next")}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            title="Next track"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="p-1 text-neutral-400">
            {zone.volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={zone.volume}
            onChange={(e) => onControl("set_volume", parseInt(e.target.value, 10))}
            className="flex-1 accent-amber-500"
            aria-label={`${zone.name} volume`}
          />
          <span className="text-xs font-mono font-medium text-neutral-300 w-8 text-right">{zone.volume}%</span>
        </div>
      </div>
    </div>
  );
}
