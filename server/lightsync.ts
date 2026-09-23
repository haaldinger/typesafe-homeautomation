// "Lights follow the music": when a synced Sonos zone starts a new track, pull the
// dominant colors from its album art and paint the lights in the chosen room.

import { readFileSync, writeFileSync } from "node:fs";
import jpeg from "jpeg-js";
import type { DeviceAction, SonosZone } from "../shared/types.ts";
import { rgbToHex } from "../shared/color.ts";
import type { DeviceGateway } from "./gateway.ts";

const FILE = new URL("../.aura-lightsync.json", import.meta.url);

/** zoneId -> roomId */
type Mappings = Record<string, string>;

function load(): Mappings {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Mappings;
  } catch {
    return {};
  }
}

let mappings: Mappings = load();
const lastArt = new Map<string, string>();

export function getLightSync(): Mappings {
  return mappings;
}

export function setLightSync(zoneId: string, roomId: string | null): Mappings {
  const next = { ...mappings };
  if (roomId) next[zoneId] = roomId;
  else delete next[zoneId];
  mappings = next;
  lastArt.delete(zoneId);
  try {
    writeFileSync(FILE, JSON.stringify(mappings));
  } catch {
    // Best-effort persistence.
  }
  return mappings;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Up to three vivid dominant colors from a JPEG cover, strongest first. */
export async function paletteFromArt(url: string): Promise<string[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return []; // not a JPEG
  const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 64 });

  // Bucket saturated, reasonably bright pixels into 12 hue bins weighted by vividness.
  const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / 5000)));
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
      const [h, s, v] = rgbToHsv(r, g, b);
      if (v < 0.25 || s < 0.3) continue;
      const w = s * v;
      const bin = bins[Math.floor(h / 30) % 12];
      bin.w += w;
      bin.r += r * w;
      bin.g += g * w;
      bin.b += b * w;
    }
  }
  const ranked = bins.filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
  if (!ranked.length) return [];
  // Keep colors that are clearly distinct so each light gets its own hue.
  const picked: [number, number][] = [];
  for (const b of ranked) {
    if (b.w < ranked[0].w * 0.15 || picked.length === 3) break;
    const [h, s] = rgbToHsv(b.r / b.w, b.g / b.w, b.b / b.w);
    if (picked.every(([ph]) => Math.min(Math.abs(ph - h), 360 - Math.abs(ph - h)) >= 45)) picked.push([h, s]);
  }
  return picked.map(([h, s]) => hsvToHex(h, Math.max(s, 0.65), 1));
}

async function syncZone(gateway: DeviceGateway, zone: SonosZone, roomId: string): Promise<void> {
  const colors = await paletteFromArt(zone.art!).catch(() => []);
  if (!colors.length) return;
  const home = await gateway.loadState();
  // Only recolor lights that are on, so a synced room never switches itself on.
  const lights = home.devices.filter((d) => d.type === "light" && d.room === roomId && d.on && d.supportsColor !== false);
  const actions: DeviceAction[] = lights.map((d, i) => ({
    deviceId: d.id,
    deviceName: d.name,
    room: d.room,
    summary: `${d.name} matched to the music`,
    patch: { color: colors[i % colors.length], colorMode: "color", effect: "none" },
  }));
  if (actions.length) await gateway.commit(actions);
}

export function startLightSync(gateway: DeviceGateway, sonos: { getZones(): Promise<SonosZone[]> }): void {
  let busy = false;
  setInterval(async () => {
    if (busy || Object.keys(mappings).length === 0) return;
    busy = true;
    try {
      const zones = await sonos.getZones();
      for (const [zoneId, roomId] of Object.entries(mappings)) {
        const zone = zones.find((z) => z.id === zoneId);
        if (!zone || zone.playback !== "playing" || !zone.art || lastArt.get(zoneId) === zone.art) continue;
        lastArt.set(zoneId, zone.art);
        await syncZone(gateway, zone, roomId).catch((e) => console.error("[lightsync]", e instanceof Error ? e.message : e));
      }
    } catch {
      // Speaker or bridge briefly unreachable; try again next tick.
    } finally {
      busy = false;
    }
  }, 4000);
}
