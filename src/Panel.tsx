import { useEffect, useMemo, useState } from "react";
import type { Device, DeviceAction, DevicePatch, HomeState, SonosZone } from "../shared/types.ts";
import { Lightbulb, Music2, Pause, Play, Plus, Minus, SkipBack, SkipForward, Sparkles, Power } from "lucide-react";
import { controlDevices, fetchHealth, fetchHome, fetchZones, sendCommand, zoneControl, type HealthInfo } from "./api.ts";
import { scenesFor } from "./components/QuickScenes.tsx";
import { AuraMark } from "./components/AuraMark.tsx";
import { LIGHT_COLORS, kelvinToHex } from "../shared/color.ts";
import { coverStyle } from "./format.ts";

// Wall-panel view for small portrait touch screens: big tiles, no hover, no typing,
// and each tab fits the screen height. Open at /panel.

type Tab = "scenes" | "lights" | "music";

const SWATCHES = Object.values(LIGHT_COLORS)
  .filter((c): c is { label: string; hex: string } => "hex" in c)
  .slice(0, 5);

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function Panel() {
  const [tab, setTab] = useState<Tab>("scenes");
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [home, setHome] = useState<HomeState | null>(null);
  const [zones, setZones] = useState<SonosZone[]>([]);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const clock = useClock();
  const real = Boolean(health && health.gateway !== "sim");

  useEffect(() => {
    const load = () => {
      fetchHealth().then(setHealth).catch(() => setHealth(null));
      fetchHome().then(setHome).catch(() => {});
      fetchZones().then(setZones).catch(() => {});
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Status messages clear themselves so the panel returns to rest.
  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), 5000);
    return () => window.clearTimeout(id);
  }, [status]);

  const scenes = useMemo(
    () =>
      scenesFor(
        real ? { sceneNames: [...new Set((home?.scenes ?? []).map((s) => s.name))], zoneName: zones[0]?.name } : undefined,
      ),
    [real, home?.scenes, zones],
  );

  async function runScene(id: string, command: string) {
    if (!home || busy) return;
    setBusy(id);
    try {
      const res = await sendCommand(command, home);
      if (res.home) setHome(res.home);
      if (res.zones) setZones(res.zones);
      setStatus({ text: res.reply });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "That didn't work. Try again.", error: true });
    } finally {
      setBusy(null);
    }
  }

  function patchLights(devices: Device[], patch: DevicePatch) {
    if (!home || devices.length === 0) return;
    const ids = new Set(devices.map((d) => d.id));
    setHome({ ...home, devices: home.devices.map((d) => (ids.has(d.id) ? { ...d, ...patch } : d)) });
    if (!real) return;
    const actions: DeviceAction[] = devices.map((d) => ({ deviceId: d.id, deviceName: d.name, room: d.room, summary: "panel", patch }));
    controlDevices(actions)
      .then(setHome)
      .catch((e) => setStatus({ text: e instanceof Error ? e.message : "Couldn't reach the lights.", error: true }));
  }

  const zone = zones[0];
  async function music(action: string, value?: number) {
    if (!zone) return;
    try {
      setZones(await zoneControl(zone.id, action, value));
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "Couldn't reach the speaker.", error: true });
    }
  }

  const rooms = (home?.rooms ?? [])
    .map((r) => ({ room: r, lights: (home?.devices ?? []).filter((d) => d.room === r.id && d.type === "light") }))
    .filter((r) => r.lights.length > 0);

  return (
    <div className="h-dvh flex flex-col bg-neutral-950 text-neutral-100 select-none overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Header: clock + status */}
      <header className="shrink-0 w-full max-w-5xl mx-auto flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2.5">
          <AuraMark size={30} className="rounded-lg" />
          <span className="text-2xl font-bold tracking-tight tabular-nums">{clock}</span>
        </div>
        <span
          className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${
            !health
              ? "border-rose-500/40 text-rose-300"
              : health.profile === "demo"
                ? "border-sky-500/40 text-sky-300"
                : "border-neutral-800 text-neutral-400"
          }`}
        >
          {!health ? "Offline" : health.profile === "demo" ? "Demo" : "Home"}
        </span>
      </header>

      <div className="shrink-0 w-full max-w-5xl mx-auto px-4 min-h-[2.25rem]" aria-live="polite">
        {status && (
          <p className={`text-sm leading-snug line-clamp-2 ${status.error ? "text-rose-300" : "text-amber-200"}`}>{status.text}</p>
        )}
      </div>

      <main className="flex-1 min-h-0 w-full max-w-5xl mx-auto px-3 pb-3 overflow-y-auto overscroll-contain">
        {tab === "scenes" && (
          <div className="grid grid-cols-2 landscape:grid-cols-3 gap-3 auto-rows-fr h-full min-h-[18rem]">
            {scenes.map((sc, i) => {
              const Icon = sc.icon;
              // An odd last tile fills the row in the two-column portrait grid.
              const span = scenes.length % 2 === 1 && i === scenes.length - 1 ? "col-span-2 landscape:col-span-1" : "";
              return (
                <button
                  key={sc.id}
                  onClick={() => runScene(sc.id, sc.command)}
                  disabled={Boolean(busy)}
                  className={`${span} relative min-h-0 rounded-3xl border bg-gradient-to-br ${sc.color} flex flex-col items-start justify-end p-4 text-left active:scale-[0.97] transition-transform disabled:opacity-60`}
                >
                  <Icon className={`w-8 h-8 mb-auto ${busy === sc.id ? "animate-pulse" : ""}`} />
                  <span className="text-lg font-bold text-white leading-tight">{sc.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {tab === "lights" && (
          <div className="flex flex-col gap-3 landscape:grid landscape:grid-cols-2 landscape:items-start">
            {rooms.map(({ room, lights }) => {
              const on = lights.some((l) => l.on);
              const color = lights.find((l) => l.on && l.colorMode === "color")?.color;
              const white = lights.find((l) => l.on && l.colorMode === "white")?.kelvin;
              const tint = color ?? (white ? kelvinToHex(white) : undefined);
              const colorable = lights.filter((l) => l.supportsColor && l.available !== false);
              return (
                <section key={room.id} className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-3">
                  <button
                    onClick={() => patchLights(lights.filter((l) => l.available !== false), { on: !on })}
                    className="w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                    aria-pressed={on}
                  >
                    <span
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${on ? "text-neutral-950" : "bg-neutral-800 text-neutral-400"}`}
                      style={on ? { backgroundColor: tint ?? "#f59e0b" } : undefined}
                    >
                      <Lightbulb className="w-7 h-7" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-lg font-bold truncate">{room.name}</span>
                      <span className="block text-sm text-neutral-400">
                        {on ? `${lights.filter((l) => l.on).length} of ${lights.length} on` : "Off"}
                      </span>
                    </span>
                    <Power className={`w-7 h-7 ${on ? "text-amber-400" : "text-neutral-600"}`} />
                  </button>
                  {real && colorable.length > 0 && (
                    <div className="flex justify-between gap-2 mt-3">
                      {SWATCHES.map((s) => (
                        <button
                          key={s.hex}
                          onClick={() => patchLights(colorable, { on: true, color: s.hex, colorMode: "color", effect: "none" })}
                          className="flex-1 h-11 rounded-2xl border border-white/10 active:scale-95 transition-transform"
                          style={{ backgroundColor: s.hex }}
                          aria-label={`${room.name} ${s.label}`}
                        />
                      ))}
                      <button
                        onClick={() => patchLights(colorable, { on: true, kelvin: 2700, colorMode: "white", effect: "none" })}
                        className="flex-1 h-11 rounded-2xl border border-white/10 active:scale-95 transition-transform"
                        style={{ backgroundColor: kelvinToHex(2700) }}
                        aria-label={`${room.name} warm white`}
                      />
                    </div>
                  )}
                </section>
              );
            })}
            {rooms.length === 0 && <p className="col-span-full text-center text-neutral-500 py-12">No lights found.</p>}
          </div>
        )}

        {tab === "music" &&
          (!zone ? (
            <p className="text-center text-neutral-500 py-12">No speakers found.</p>
          ) : (
            <div className="h-full min-h-[20rem] flex flex-col landscape:flex-row items-center justify-center gap-5 landscape:gap-10 text-center">
              <div
                className="shrink-0 w-[min(60vw,15rem,32dvh)] landscape:w-[min(40vw,18rem,50dvh)] aspect-square max-w-full rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl"
                style={zone.art ? undefined : coverStyle(zone.track?.title ?? zone.name)}
              >
                {zone.art ? (
                  <img src={zone.art} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/60">
                    <Music2 className="w-16 h-16" />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-5 min-w-0 max-w-full">
                <div className="min-w-0 max-w-full px-2">
                  <p className="text-xl font-bold truncate">{zone.track?.title ?? "Nothing playing"}</p>
                  <p className="text-neutral-400 truncate">{zone.track?.artist ?? zone.name}</p>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => music("previous")} className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center active:scale-95" aria-label="Previous">
                    <SkipBack className="w-7 h-7" />
                  </button>
                  <button
                    onClick={() => music(zone.playback === "playing" ? "pause" : "play")}
                    className="w-20 h-20 rounded-3xl bg-amber-500 text-neutral-950 flex items-center justify-center active:scale-95 shadow-lg shadow-amber-500/30"
                    aria-label={zone.playback === "playing" ? "Pause" : "Play"}
                  >
                    {zone.playback === "playing" ? <Pause className="w-9 h-9 fill-current" /> : <Play className="w-9 h-9 fill-current translate-x-0.5" />}
                  </button>
                  <button onClick={() => music("next")} className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center active:scale-95" aria-label="Next">
                    <SkipForward className="w-7 h-7" />
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => music("set_volume", Math.max(0, zone.volume - 5))} className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center active:scale-95" aria-label="Volume down">
                    <Minus className="w-6 h-6" />
                  </button>
                  <span className="w-16 text-2xl font-bold tabular-nums">{zone.volume}</span>
                  <button onClick={() => music("set_volume", Math.min(100, zone.volume + 5))} className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center active:scale-95" aria-label="Volume up">
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          ))}
      </main>

      {/* Bottom tabs: thumb-reachable on a portrait screen */}
      <nav className="shrink-0 border-t border-neutral-800 bg-neutral-950 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-3 w-full max-w-5xl mx-auto" role="tablist">
          {(
            [
              { id: "scenes", label: "Scenes", icon: Sparkles },
              { id: "lights", label: "Lights", icon: Lightbulb },
              { id: "music", label: "Music", icon: Music2 },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center justify-center gap-1 py-3 min-h-14 text-xs font-semibold transition-colors ${active ? "text-amber-400" : "text-neutral-500"}`}
              >
                <Icon className="w-6 h-6" />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
