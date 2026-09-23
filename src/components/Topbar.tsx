import { Sparkles, Lightbulb, Thermometer, Lock, Unlock, Speaker, Activity, Settings2 } from "lucide-react";
import type { HealthInfo } from "../api.ts";

interface TopbarProps {
  status: {
    on: number;
    temp: number;
    locks: number;
    unlocked: number;
  };
  activeZonesCount: number;
  /** null = health not loaded yet / backend unreachable */
  health: HealthInfo | null;
  healthLoaded: boolean;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  onOpenSettings: () => void;
  onOpenScenes: () => void;
}

export function Topbar({
  status,
  activeZonesCount,
  health,
  healthLoaded,
  inspectorOpen,
  onToggleInspector,
  onOpenSettings,
  onOpenScenes,
}: TopbarProps) {
  return (
    <header className="border-b border-neutral-800/80 bg-neutral-950/70 backdrop-blur-xl sticky top-0 z-30 px-4 sm:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center font-black text-neutral-950 text-xl shadow-lg shadow-amber-500/20 transition-all duration-300 group-hover:scale-105">
              A
            </div>
            <div className="absolute -inset-1 rounded-2xl bg-amber-500/20 blur-sm -z-10" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Aura
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 tracking-wider">
                Sonos + Home
              </span>
            </h1>
            <p className="text-xs text-neutral-400 font-medium">Smart home · powered by TypeSafe</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs text-neutral-300 shadow-inner">
            <div className={`p-1 rounded-lg ${status.on > 0 ? "bg-amber-500/20 text-amber-400" : "bg-neutral-800 text-neutral-500"}`}>
              <Lightbulb className="w-3.5 h-3.5" />
            </div>
            <span>
              <strong className="text-white font-semibold">{status.on}</strong> {status.on === 1 ? "light" : "lights"} on
            </span>
          </div>

          {status.temp > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs text-neutral-300">
              <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
                <Thermometer className="w-3.5 h-3.5" />
              </div>
              <span>
                <strong className="text-white font-semibold">{status.temp}°F</strong> avg
              </span>
            </div>
          )}

          {status.locks > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs text-neutral-300">
              <div className={`p-1 rounded-lg ${status.unlocked === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                {status.unlocked === 0 ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </div>
              <span className={status.unlocked > 0 ? "text-rose-300 font-medium" : ""}>
                {status.unlocked === 0 ? "All locked" : `${status.unlocked} unlocked`}
              </span>
            </div>
          )}

          {activeZonesCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              <Speaker className="w-3.5 h-3.5 text-amber-400" />
              <span>
                <strong className="text-amber-200">{activeZonesCount}</strong> {activeZonesCount === 1 ? "zone" : "zones"} playing
              </span>
            </div>
          )}

          {healthLoaded && (
            <button
              onClick={onOpenSettings}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-medium ${
                health
                  ? "bg-neutral-900/90 border-neutral-800 text-neutral-400"
                  : "bg-rose-500/10 border-rose-500/40 text-rose-300"
              }`}
              title="Backend status"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${health ? "bg-emerald-400" : "bg-rose-400"}`} />
              {health ? `sonos: ${health.sonos ?? "?"}` : "backend offline"}
            </button>
          )}

          <div className="flex items-center gap-1.5 ml-auto md:ml-2">
            <button
              onClick={onOpenScenes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-xs font-medium text-neutral-200 hover:text-white transition shadow-sm"
              title="Quick scenes"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Scenes</span>
            </button>

            <button
              onClick={onToggleInspector}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition shadow-sm ${
                inspectorOpen
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700"
              }`}
              title="Toggle decision trace"
            >
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Trace</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200 transition shadow-sm"
              title="Backend settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
