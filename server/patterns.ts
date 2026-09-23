// Repeating light animations (blink, alternate, pulse, fireplace, police), one per
// room. Starting a pattern snapshots the lights; stopping restores them.

import type { Device, DeviceAction, DevicePatch, PatternKind, PatternSpec, RunningPattern } from "../shared/types.ts";
import { colorName } from "../shared/color.ts";
import type { DeviceGateway } from "./gateway.ts";

/** Nothing flashes faster than twice a second (photosensitivity). */
export const MIN_INTERVAL_MS = 500;
const MAX_INTERVAL_MS = 10_000;
const FIRE = ["#ff5a0a", "#ff7a00", "#ff9a2e", "#ff6a14"];

export const PATTERN_PRESETS: Record<PatternKind, PatternSpec> = {
  blink: { kind: "blink", colors: [], intervalMs: 2000 },
  alternate: { kind: "alternate", colors: ["#8f3dff", "#ff4fa3"], intervalMs: 1500 },
  pulse: { kind: "pulse", colors: [], intervalMs: 3000 },
  fireplace: { kind: "fireplace", colors: FIRE, intervalMs: 700 },
  police: { kind: "police", colors: ["#ff2a1a", "#1e5bff"], intervalMs: 700 },
};

interface Running {
  info: RunningPattern;
  lights: Device[];
  snapshot: Device[];
  timer: ReturnType<typeof setInterval>;
  step: number;
  busy: boolean;
}

const running = new Map<string, Running>();

function label(spec: PatternSpec): string {
  const secs = `${Number((spec.intervalMs / 1000).toFixed(1))}s`;
  const colors = spec.colors.map((c) => colorName({ color: c })).join(" & ");
  switch (spec.kind) {
    case "blink":
      return `Blinking${colors ? ` ${colors}` : ""} every ${secs}`;
    case "alternate":
      return `Alternating ${colors || "colors"} every ${secs}`;
    case "pulse":
      return `Pulsing${colors ? ` ${colors}` : ""}`;
    case "fireplace":
      return "Fireplace flicker";
    case "police":
      return "Police lights";
  }
}

function patch(device: Device, p: DevicePatch): DeviceAction {
  return { deviceId: device.id, deviceName: device.name, room: device.room, summary: "pattern", patch: p };
}

function colorPatch(hex: string | undefined): DevicePatch {
  return hex ? { color: hex, colorMode: "color", effect: "none" } : {};
}

/** The light commands for one beat of a pattern. Returns [now, afterDelay?]. */
function frame(r: Running): [DeviceAction[], DeviceAction[]?] {
  const { kind, colors, intervalMs } = r.info;
  const n = colors.length;
  const pick = (i: number) => (n ? colors[(r.step + i) % n] : undefined);
  switch (kind) {
    case "blink":
      // Dark for a moment, then back on with the colors rotated across the lights.
      return [
        r.lights.map((d) => patch(d, { on: false, transitionMs: 0 })),
        r.lights.map((d, i) => patch(d, { on: true, level: 100, transitionMs: 0, ...colorPatch(pick(i)) })),
      ];
    case "alternate":
    case "police":
      return [r.lights.map((d, i) => patch(d, { on: true, level: 100, transitionMs: kind === "police" ? 0 : 200, ...colorPatch(pick(i)) }))];
    case "pulse":
      return [
        r.lights.map((d, i) =>
          patch(d, { on: true, level: r.step % 2 ? 15 : 100, transitionMs: intervalMs, ...colorPatch(pick(i)) }),
        ),
      ];
    case "fireplace":
      return [
        r.lights.map((d) =>
          patch(d, {
            on: true,
            level: 30 + Math.floor(Math.random() * 50),
            transitionMs: 400,
            ...colorPatch(FIRE[Math.floor(Math.random() * FIRE.length)]),
          }),
        ),
      ];
  }
}

function restoreActions(snapshot: Device[]): DeviceAction[] {
  return snapshot.map((d) => {
    if (!d.on) return patch(d, { on: false, effect: "none", transitionMs: 400 });
    const p: DevicePatch = { on: true, effect: d.effect ?? "none", transitionMs: 400 };
    if (d.level !== undefined) p.level = d.level;
    if (d.colorMode === "white" && d.kelvin) Object.assign(p, { kelvin: d.kelvin, colorMode: "white" });
    else if (d.colorMode === "color" && d.color) Object.assign(p, { color: d.color, colorMode: "color" });
    return patch(d, p);
  });
}

export function listPatterns(): RunningPattern[] {
  return [...running.values()].map((r) => r.info);
}

/** Stop one room's pattern ("all" stops every pattern). Restores the lights unless told not to. */
export async function stopPattern(gateway: DeviceGateway, room: string, restore = true): Promise<void> {
  const keys = room === "all" ? [...running.keys()] : running.has(room) ? [room] : [];
  for (const key of keys) {
    const r = running.get(key)!;
    clearInterval(r.timer);
    running.delete(key);
    if (restore) await gateway.commit(restoreActions(r.snapshot)).catch(() => {});
  }
}

/** Stop patterns in these rooms without restoring (a manual change is taking over). */
export function interruptPatterns(gateway: DeviceGateway, rooms: string[]): void {
  if (!rooms.length) return;
  for (const room of new Set(rooms)) if (running.has(room)) void stopPattern(gateway, room, false);
  // A whole-house pattern covers these rooms too.
  if (running.has("all")) void stopPattern(gateway, "all", false);
}

export async function startPattern(gateway: DeviceGateway, room: string, input: PatternSpec): Promise<RunningPattern> {
  const spec: PatternSpec = {
    kind: input.kind,
    colors: input.kind === "police" || input.kind === "fireplace" ? PATTERN_PRESETS[input.kind].colors : input.colors,
    intervalMs: Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, input.intervalMs || PATTERN_PRESETS[input.kind].intervalMs)),
  };
  // One pattern per room; an "all" pattern replaces everything.
  await stopPattern(gateway, room === "all" ? "all" : room);
  if (room !== "all") await stopPattern(gateway, "all");

  const home = await gateway.loadState();
  const lights = home.devices.filter(
    (d) => d.type === "light" && d.available !== false && (room === "all" || d.room === room),
  );
  if (!lights.length) throw new Error("No reachable lights in that room.");

  const info: RunningPattern = { ...spec, room, label: label(spec) };
  const r: Running = { info, lights, snapshot: lights.map((d) => ({ ...d })), step: 0, busy: false, timer: 0 as never };
  const tick = async () => {
    if (r.busy) return;
    r.busy = true;
    try {
      const [now, later] = frame(r);
      await gateway.commit(now);
      if (later) {
        await new Promise((res) => setTimeout(res, Math.min(500, spec.intervalMs / 3)));
        if (running.get(room) === r) await gateway.commit(later);
      }
      r.step += 1;
    } catch {
      // Bridge hiccup; the next beat retries.
    } finally {
      r.busy = false;
    }
  };
  r.timer = setInterval(tick, spec.intervalMs);
  running.set(room, r);
  void tick();
  return info;
}
