// Philips Hue bridge integration over the bridge's local REST API (v1, plain HTTP).
// Rooms come from the bridge's "Room" groups; each light becomes a light device and
// saved scenes are exposed for activation. Configure with HUE_BRIDGE / HUE_USERNAME
// in .env, or pair with `npm run hue:pair`, which saves the credentials to .aura-hue.json.

import { readFileSync, writeFileSync } from "node:fs";
import type { Device, DeviceAction, HomeState, LightScene, Room } from "../shared/types.ts";
import { hexToXy, MAX_KELVIN, MIN_KELVIN, xyToHex } from "../shared/color.ts";

const CRED_FILE = new URL("../.aura-hue.json", import.meta.url);
const LIGHT_PREFIX = "hue-light-";
const SCENE_PREFIX = "hue-scene-";

interface HueCreds {
  bridge: string;
  username: string;
}

function creds(): HueCreds {
  if (process.env.HUE_BRIDGE && process.env.HUE_USERNAME) {
    return { bridge: process.env.HUE_BRIDGE, username: process.env.HUE_USERNAME };
  }
  try {
    const c = JSON.parse(readFileSync(CRED_FILE, "utf8")) as HueCreds;
    if (c.bridge && c.username) return c;
  } catch {
    // fall through
  }
  throw new Error("Hue bridge isn't paired. Press the bridge's link button, then run `npm run hue:pair <bridge-ip>`.");
}

type HueResult = Array<{ success?: unknown; error?: { type: number; description: string } }>;

async function hue<T>(path: string, init?: RequestInit): Promise<T> {
  const { bridge, username } = creds();
  const res = await fetch(`http://${bridge}/api/${username}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Hue bridge ${res.status} on ${path}`);
  const body = (await res.json()) as T;
  // The bridge reports errors with HTTP 200 and an error array.
  if (Array.isArray(body)) {
    const err = (body as HueResult).find((r) => r.error)?.error;
    if (err) throw new Error(`Hue: ${err.description}`);
  }
  return body;
}

const put = (path: string, body: Record<string, unknown>) =>
  hue<HueResult>(path, { method: "PUT", body: JSON.stringify(body) });

interface HueLight {
  name: string;
  state: {
    on: boolean;
    bri?: number;
    reachable?: boolean;
    colormode?: "xy" | "ct" | "hs";
    xy?: [number, number];
    ct?: number;
    effect?: string;
  };
  capabilities?: { control?: { colorgamut?: unknown; ct?: { min: number; max: number } } };
}
interface HueGroup {
  name: string;
  type: string;
  lights: string[];
}
interface HueScene {
  name: string;
  type: "GroupScene" | "LightScene";
  group?: string;
  lights: string[];
  recycle?: boolean;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unassigned";
}

function toDevice(id: string, l: HueLight, room: string): Device {
  const s = l.state;
  const control = l.capabilities?.control ?? {};
  const device: Device = {
    id: `${LIGHT_PREFIX}${id}`,
    name: l.name.trim(),
    room,
    type: "light",
    on: s.on && s.reachable !== false,
    available: s.reachable !== false,
    level: s.bri !== undefined ? Math.round((s.bri / 254) * 100) : undefined,
    supportsColor: Boolean(control.colorgamut) || s.xy !== undefined,
    supportsWhite: Boolean(control.ct) || s.ct !== undefined,
    effect: s.effect === "colorloop" ? "colorloop" : "none",
  };
  if (s.colormode === "ct" && s.ct) {
    device.colorMode = "white";
    device.kelvin = Math.round(1e6 / s.ct / 50) * 50;
  } else if (s.xy) {
    device.colorMode = "color";
    device.color = xyToHex(s.xy[0], s.xy[1]);
  }
  return device;
}

export async function loadHueState(): Promise<HomeState> {
  const [lights, groups, scenes] = await Promise.all([
    hue<Record<string, HueLight>>("/lights"),
    hue<Record<string, HueGroup>>("/groups"),
    hue<Record<string, HueScene>>("/scenes"),
  ]);

  const roomOf = new Map<string, Room>();
  const roomByGroup = new Map<string, Room>();
  const rooms: Room[] = [];
  for (const [gid, g] of Object.entries(groups)) {
    if (g.type !== "Room") continue;
    const room = { id: slug(g.name), name: g.name };
    rooms.push(room);
    roomByGroup.set(gid, room);
    for (const id of g.lights) roomOf.set(id, room);
  }

  const devices = Object.entries(lights).map(([id, l]) => toDevice(id, l, roomOf.get(id)?.id ?? "unassigned"));

  // Skip the bridge's temporary "recycle" scenes and duplicate names within a room.
  const seen = new Set<string>();
  const lightScenes: LightScene[] = [];
  for (const [sid, sc] of Object.entries(scenes)) {
    if (sc.recycle) continue;
    const room = sc.group ? roomByGroup.get(sc.group)?.id : roomOf.get(sc.lights[0])?.id;
    const key = `${room ?? ""}|${sc.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lightScenes.push({ id: `${SCENE_PREFIX}${sid}`, name: sc.name, ...(room ? { room } : {}) });
  }
  lightScenes.sort((a, b) => a.name.localeCompare(b.name));

  if (devices.some((d) => d.room === "unassigned")) rooms.push({ id: "unassigned", name: "Unassigned" });
  rooms.sort((a, b) => a.name.localeCompare(b.name));
  return { rooms, devices, scenes: lightScenes };
}

function lightState(patch: DeviceAction["patch"]): Record<string, unknown> | null {
  if (patch.on === false || patch.level === 0) {
    return patch.transitionMs !== undefined ? { on: false, transitiontime: Math.round(patch.transitionMs / 100) } : { on: false };
  }
  const state: Record<string, unknown> = {};
  if (patch.on === true) state.on = true;
  if (patch.level !== undefined) Object.assign(state, { on: true, bri: Math.max(1, Math.round((patch.level / 100) * 254)) });
  if (patch.color) Object.assign(state, { on: true, xy: hexToXy(patch.color) });
  if (patch.kelvin !== undefined) {
    const k = Math.max(MIN_KELVIN, Math.min(MAX_KELVIN, patch.kelvin));
    Object.assign(state, { on: true, ct: Math.max(153, Math.min(500, Math.round(1e6 / k))) });
  }
  // A new fixed color or white stops a running color loop, or the loop would override it.
  if (patch.effect) state.effect = patch.effect;
  else if (patch.color || patch.kelvin !== undefined) state.effect = "none";
  if (patch.effect === "colorloop") state.on = true;
  if (patch.alert) state.alert = "lselect";
  if (!Object.keys(state).length) return null;
  if (patch.transitionMs !== undefined) state.transitiontime = Math.round(patch.transitionMs / 100);
  return state;
}

async function activateScene(sceneId: string): Promise<void> {
  const scene = await hue<HueScene>(`/scenes/${sceneId}`);
  const group = scene.type === "GroupScene" && scene.group ? scene.group : "0";
  // Scenes don't cancel a running color loop, which would keep overriding them.
  await put(`/groups/${group}/action`, { effect: "none" });
  await put(`/groups/${group}/action`, { scene: sceneId });
}

export async function commitToHue(actions: DeviceAction[]): Promise<void> {
  // One unreachable or off bulb shouldn't sink the rest of the command.
  const results = await Promise.allSettled(
    actions.map(async ({ deviceId, patch }) => {
      if (deviceId.startsWith(SCENE_PREFIX)) return activateScene(deviceId.slice(SCENE_PREFIX.length));
      if (!deviceId.startsWith(LIGHT_PREFIX)) return;
      const lightId = deviceId.slice(LIGHT_PREFIX.length);
      const state = lightState(patch);
      if (!state) return;
      await put(`/lights/${lightId}/state`, state);
      // "lselect" blinks for 15s; cut it to a few blinks.
      if (patch.alert) setTimeout(() => put(`/lights/${lightId}/state`, { alert: "none" }).catch(() => {}), 3000);
    }),
  );
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length && failed.length === results.length) throw failed[0].reason;
  for (const f of failed) console.error("[hue]", f.reason instanceof Error ? f.reason.message : f.reason);
}

/** Create a bridge user. The bridge's link button must have been pressed within the last 30s. */
export async function pairHue(bridge: string): Promise<string> {
  const res = await fetch(`http://${bridge}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ devicetype: "aura#homeautomation" }),
    signal: AbortSignal.timeout(5000),
  });
  const body = (await res.json()) as Array<{ success?: { username: string }; error?: { type: number; description: string } }>;
  const username = body[0]?.success?.username;
  if (!username) {
    const err = body[0]?.error;
    throw new Error(err?.type === 101 ? "Press the link button on the Hue bridge, then run this again within 30 seconds." : `Pairing failed: ${err?.description ?? "unknown error"}`);
  }
  writeFileSync(CRED_FILE, JSON.stringify({ bridge, username }));
  return username;
}
