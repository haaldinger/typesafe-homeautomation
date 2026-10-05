import { Sparkles, Lightbulb, Thermometer, Lock, Unlock, Speaker, Activity, Settings2, Smartphone, Square, Layers } from "lucide-react";
import type { HealthInfo } from "../api.ts";
import { AuraMark } from "./AuraMark.tsx";

export type DevicePersona = "auto" | "nspanel-pro" | "nspanel-120" | "iphone";

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
  persona: DevicePersona;
  onChangePersona: (persona: DevicePersona) => void;
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
  persona,
  onChangePersona,
  onToggleInspector,
  onOpenSettings,
  onOpenScenes,
}: TopbarProps) {
  const pill = "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap shrink-0";
  const iconBtn =
    "flex items-center justify-center gap-1.5 min-h-9 min-w-9 touch:min-h-11 touch:min-w-11 px-2.5 rounded-xl border text-xs font-medium transition shadow-sm";

  return (
    <header className="border-b border-neutral-800/80 bg-neutral-950/70 backdrop-blur-xl lg:sticky top-0 z-30 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))] transition-all">
      <div className="max-w-7xl mx-auto flex flex-wrap xl:flex-nowrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1 xl:flex-none">
          <div className="relative group shrink-0">
            <AuraMark size={40} className="rounded-2xl shadow-lg shadow-amber-500/20 transition-transform duration-300 group-hover:scale-105" />
            <div className="absolute -inset-1 rounded-2xl bg-amber-500/20 blur-sm -z-10" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Aura
              <span className="hidden min-[400px]:inline text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 tracking-wider whitespace-nowrap">
                Sonos + Home
              </span>
            </h1>
            <p className="text-xs text-neutral-400 font-medium truncate">Smart home · powered by TypeSafe</p>
          </div>
        </div>

        {/* Status pills: one scrollable line on phones, wrapping on wider screens. */}
        <div className="order-last xl:order-none w-full xl:w-auto xl:flex-1 min-w-0 -mx-1 px-1 xl:mx-0 xl:px-0 flex flex-nowrap sm:flex-wrap xl:justify-end items-center gap-2 sm:gap-3 overflow-x-auto sm:overflow-visible no-scrollbar">
          <div className={`${pill} bg-neutral-900/90 border-neutral-800 text-neutral-300 shadow-inner`}>
            <div className={`p-1 rounded-lg ${status.on > 0 ? "bg-amber-500/20 text-amber-400" : "bg-neutral-800 text-neutral-500"}`}>
              <Lightbulb className="w-3.5 h-3.5" />
            </div>
            <span>
              <strong className="text-white font-semibold">{status.on}</strong> {status.on === 1 ? "light" : "lights"} on
            </span>
          </div>

          {status.temp > 0 && (
            <div className={`${pill} bg-neutral-900/90 border-neutral-800 text-neutral-300`}>
              <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
                <Thermometer className="w-3.5 h-3.5" />
              </div>
              <span>
                <strong className="text-white font-semibold">{status.temp}°F</strong> avg
              </span>
            </div>
          )}

          {status.locks > 0 && (
            <div className={`${pill} bg-neutral-900/90 border-neutral-800 text-neutral-300`}>
              <div className={`p-1 rounded-lg ${status.unlocked === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                {status.unlocked === 0 ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </div>
              <span className={status.unlocked > 0 ? "text-rose-300 font-medium" : ""}>
                {status.unlocked === 0 ? "All locked" : `${status.unlocked} unlocked`}
              </span>
            </div>
          )}

          {activeZonesCount > 0 && (
            <div className={`${pill} bg-amber-500/10 border-amber-500/30 text-amber-300`}>
              <Speaker className="w-3.5 h-3.5 text-amber-400" />
              <span>
                <strong className="text-amber-200">{activeZonesCount}</strong> {activeZonesCount === 1 ? "zone" : "zones"} playing
              </span>
            </div>
          )}

          {healthLoaded && (
            <button
              onClick={onOpenSettings}
              className={`${pill} min-h-9 touch:min-h-11 font-medium text-[11px] ${
                !health
                  ? "bg-rose-500/10 border-rose-500/40 text-rose-300"
                  : health.profile === "demo"
                    ? "bg-sky-500/10 border-sky-500/40 text-sky-300"
                    : "bg-neutral-900/90 border-neutral-800 text-neutral-400"
              }`}
              title="Mode and backend status (click to switch Demo / Home)"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${!health ? "bg-rose-400" : health.profile === "demo" ? "bg-sky-400" : "bg-emerald-400"}`}
              />
              {!health ? "backend offline" : health.profile === "demo" ? "Demo mode" : `Home · ${health.gateway} + sonos ${health.sonos ?? "?"}`}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden sm:flex items-center gap-0.5 bg-neutral-900/90 border border-neutral-800 rounded-xl p-0.5">
            <button type="button" onClick={() => onChangePersona("auto")} className={`min-h-9 min-w-9 touch:min-h-11 touch:min-w-11 p-1.5 rounded-lg text-xs transition flex items-center justify-center ${persona === "auto" ? "bg-white/[0.12] text-amber-300" : "text-neutral-400 hover:text-white"}`} title="Responsive auto view" aria-label="Responsive auto view"><Settings2 className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => onChangePersona("iphone")} className={`min-h-9 min-w-9 touch:min-h-11 touch:min-w-11 p-1.5 rounded-lg text-xs transition flex items-center justify-center ${persona === "iphone" ? "bg-white/[0.12] text-amber-300" : "text-neutral-400 hover:text-white"}`} title="iPhone preview" aria-label="iPhone preview"><Smartphone className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => onChangePersona("nspanel-pro")} className={`min-h-9 min-w-9 touch:min-h-11 touch:min-w-11 p-1.5 rounded-lg text-xs transition flex items-center justify-center ${persona === "nspanel-pro" ? "bg-white/[0.12] text-amber-300" : "text-neutral-400 hover:text-white"}`} title="NSPanel Pro Gen2 preview" aria-label="NSPanel Pro Gen2 preview"><Square className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => onChangePersona("nspanel-120")} className={`min-h-9 min-w-9 touch:min-h-11 touch:min-w-11 p-1.5 rounded-lg text-xs transition flex items-center justify-center ${persona === "nspanel-120" ? "bg-white/[0.12] text-amber-300" : "text-neutral-400 hover:text-white"}`} title="NSPanel 120PW preview" aria-label="NSPanel 120PW preview"><Layers className="w-3.5 h-3.5" /></button>
          </div>
          <button
            onClick={onOpenScenes}
            className={`${iconBtn} bg-neutral-900 hover:bg-neutral-800 border-neutral-800 hover:border-neutral-700 text-neutral-200 hover:text-white`}
            title="Quick scenes"
            aria-label="Quick scenes"
          >
            <Sparkles className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Scenes</span>
          </button>

          <button
            onClick={onToggleInspector}
            className={`${iconBtn} ${
              inspectorOpen
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="Toggle decision trace"
            aria-label="Toggle decision trace"
            aria-pressed={inspectorOpen}
          >
            <Activity className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Trace</span>
          </button>

          <button
            onClick={onOpenSettings}
            className={`${iconBtn} bg-neutral-900 hover:bg-neutral-800 border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200`}
            title="Backend settings"
            aria-label="Backend settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
