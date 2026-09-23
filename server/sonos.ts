// Sonos backend. `mock` keeps three in-memory zones (Living Room, Kitchen,
// Deck) so the whole NL flow is testable without hardware; `live` talks to a
// running node-sonos-http-api. Select with SONOS_MODE in .env.

import type { AudioAction, EqState, Favorite, QueueTrack, SonosZone } from "../shared/types.ts";
import {
  applyDirect,
  directEnabled,
  getDirectFavorites,
  getDirectQueue,
  getDirectZones,
  getEqDirect,
  playFavoriteDirect,
  playRadioDirect,
  playSpotifyDirect,
  queueControlDirect,
  setEqDirect,
  spotifyLinked as directSpotifyLinked,
} from "./sonos-direct.ts";

const MODE = () => (process.env.SONOS_MODE ?? "mock").toLowerCase();
const API_URL = () => (process.env.SONOS_API_URL ?? "http://localhost:5005").replace(/\/$/, "");

// ---- Mock state (persists for the life of the server process) ---------------

const DEMO_TRACKS = [
  { title: "Midnight City", artist: "M83", duration: 244 },
  { title: "Redbone", artist: "Childish Gambino", duration: 327 },
  { title: "Coffee", artist: "Sylvan Esso", duration: 184 },
  { title: "Tadow", artist: "Masego", duration: 300 },
  { title: "Electric Feel", artist: "MGMT", duration: 229 },
];

function freshZones(): SonosZone[] {
  return [
    { id: "living_room", name: "Living Room", playback: "paused", track: { title: "Redbone", artist: "Childish Gambino" }, volume: 25, groupedWith: [], elapsed: 78, duration: 327 },
    { id: "kitchen", name: "Kitchen", playback: "playing", track: { title: "Coffee", artist: "Sylvan Esso" }, volume: 18, groupedWith: [], elapsed: 42, duration: 184 },
    { id: "deck", name: "Deck", playback: "stopped", track: null, volume: 30, groupedWith: [], elapsed: 0, duration: 0 },
  ];
}

let mockZones: SonosZone[] = freshZones();

function setTrack(zone: SonosZone, t: { title: string; artist: string; duration: number }): void {
  zone.track = { title: t.title, artist: t.artist };
  zone.duration = t.duration;
  zone.elapsed = 0;
}

function clampVol(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function zoneById(id: string): SonosZone | undefined {
  return mockZones.find((z) => z.id === id);
}

function applyMock(action: AudioAction): void {
  const zone = zoneById(action.zone);
  if (!zone) return;
  switch (action.kind) {
    case "play":
    case "resume":
    case "play_favorite":
      zone.playback = "playing";
      if (!zone.track) setTrack(zone, DEMO_TRACKS[0]);
      break;
    case "play_station":
      zone.playback = "playing";
      zone.track = { title: action.chips[0] ?? "Radio", artist: "Radio" };
      zone.duration = 0;
      zone.elapsed = 0;
      break;
    case "pause":
      zone.playback = "paused";
      break;
    case "stop":
      zone.playback = "stopped";
      break;
    case "next": {
      const i = DEMO_TRACKS.findIndex((t) => t.title === zone.track?.title);
      setTrack(zone, DEMO_TRACKS[(i + 1 + DEMO_TRACKS.length) % DEMO_TRACKS.length]);
      zone.playback = "playing";
      break;
    }
    case "previous": {
      const i = DEMO_TRACKS.findIndex((t) => t.title === zone.track?.title);
      setTrack(zone, DEMO_TRACKS[(i - 1 + DEMO_TRACKS.length) % DEMO_TRACKS.length]);
      zone.playback = "playing";
      break;
    }
    case "volume_up":
      zone.volume = clampVol(zone.volume + 10);
      break;
    case "volume_down":
      zone.volume = clampVol(zone.volume - 10);
      break;
    case "set_volume":
      if (typeof action.chips[0] === "string") {
        const n = parseInt(action.chips[0].replace(/\D/g, ""), 10);
        if (!Number.isNaN(n)) zone.volume = clampVol(n);
      }
      break;
    case "group": {
      // group zone with everyone named in chips
      const others = mockZones.filter((z) => z.id !== zone.id && action.summary.includes(z.name));
      const groupNames = [zone.name, ...others.map((z) => z.name)];
      for (const z of [zone, ...others]) {
        z.groupedWith = groupNames.filter((n) => n !== z.name);
        z.playback = zone.playback === "stopped" ? "playing" : zone.playback;
        if (!z.track) {
          z.track = zone.track;
          z.duration = zone.duration;
          z.elapsed = zone.elapsed;
        }
      }
      break;
    }
    case "ungroup":
      for (const z of mockZones) {
        if (z.id === zone.id || z.groupedWith.includes(zone.name)) z.groupedWith = [];
      }
      break;
    default:
      break;
  }
}

// ---- Mock queue -------------------------------------------------------------

const mockQueues = new Map<string, { title: string; artist: string; duration: number }[]>();

function mockQueueFor(id: string): { title: string; artist: string; duration: number }[] {
  if (!mockQueues.has(id)) mockQueues.set(id, DEMO_TRACKS.map((t) => ({ ...t })));
  return mockQueues.get(id)!;
}

function getMockQueue(id: string): QueueTrack[] {
  const zone = zoneById(id);
  return mockQueueFor(id).map((t, i) => ({
    position: i + 1,
    title: t.title,
    artist: t.artist,
    ...(zone?.track?.title === t.title ? { current: true } : {}),
  }));
}

function queueControlMock(id: string, op: "play" | "remove", position: number): void {
  const q = mockQueueFor(id);
  if (op === "play") {
    const t = q[position - 1];
    const zone = zoneById(id);
    if (t && zone) {
      setTrack(zone, t);
      zone.playback = "playing";
    }
  } else {
    q.splice(position - 1, 1);
  }
}

const MOCK_FAVORITES: Favorite[] = [
  { id: "fav-1", title: "Morning Coffee", description: "Playlist" },
  { id: "fav-2", title: "Jazz Vibes", description: "Playlist" },
  { id: "fav-3", title: "KEXP 90.3", description: "Radio" },
  { id: "fav-4", title: "Deep Focus", description: "Playlist" },
];

function playFavoriteMock(zoneId: string, favoriteId: string): void {
  const zone = zoneById(zoneId);
  const fav = MOCK_FAVORITES.find((f) => f.id === favoriteId);
  if (zone && fav) {
    zone.track = { title: fav.title, artist: fav.description ?? "Favorite" };
    zone.playback = "playing";
    zone.duration = 0;
    zone.elapsed = 0;
  }
}

const mockEq = new Map<string, EqState>();
function mockEqFor(id: string): EqState {
  if (!mockEq.has(id)) mockEq.set(id, { bass: 0, treble: 0, night: false, loudness: true });
  return mockEq.get(id)!;
}

// ---- Live (node-sonos-http-api) --------------------------------------------

async function sonosApi(path: string): Promise<unknown> {
  const res = await fetch(`${API_URL()}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sonos API ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json().catch(() => null);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapLiveZones(raw: any): SonosZone[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((z: any) => {
    const coord = z.coordinator ?? {};
    const state = coord.state ?? {};
    const track = state.currentTrack ?? {};
    const members: string[] = (z.members ?? []).map((m: any) => m.roomName).filter(Boolean);
    const name = coord.roomName ?? members[0] ?? "Zone";
    return {
      id: slug(name),
      name,
      playback: state.playbackState === "PLAYING" ? "playing" : state.playbackState === "PAUSED_PLAYBACK" ? "paused" : "stopped",
      track: track.title ? { title: track.title, artist: track.artist ?? "" } : null,
      volume: typeof coord.groupState?.volume === "number" ? coord.groupState.volume : 20,
      groupedWith: members.filter((m) => m !== name),
      art: track.absoluteAlbumArtUri ?? undefined,
      elapsed: typeof state.elapsedTime === "number" ? state.elapsedTime : 0,
      duration: typeof track.duration === "number" ? track.duration : 0,
    } as SonosZone;
  });
}
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapLiveQueue(raw: any): QueueTrack[] {
  const items = Array.isArray(raw) ? raw : raw?.queue ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((t: any, i: number) => ({
    position: i + 1,
    title: t.title ?? "",
    artist: t.artist ?? "",
    ...(t.album ? { album: t.album } : {}),
    ...(t.albumArtUri || t.absoluteAlbumArtUri ? { art: t.absoluteAlbumArtUri ?? t.albumArtUri } : {}),
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "zone";
}

async function commitLive(action: AudioAction): Promise<void> {
  const room = encodeURIComponent(action.zoneName);
  switch (action.kind) {
    case "play":
    case "resume":
      await sonosApi(`/${room}/play`);
      break;
    case "pause":
      await sonosApi(`/${room}/pause`);
      break;
    case "stop":
      await sonosApi(`/${room}/pause`);
      break;
    case "next":
      await sonosApi(`/${room}/next`);
      break;
    case "previous":
      await sonosApi(`/${room}/previous`);
      break;
    case "volume_up":
      await sonosApi(`/${room}/volume/+10`);
      break;
    case "volume_down":
      await sonosApi(`/${room}/volume/-10`);
      break;
    case "set_volume": {
      const n = parseInt((action.chips[0] ?? "").replace(/\D/g, ""), 10);
      if (!Number.isNaN(n)) await sonosApi(`/${room}/volume/${n}`);
      break;
    }
    case "group": {
      // Join every other named zone to this coordinator.
      for (const other of action.chips) {
        if (other && other !== action.zoneName) {
          await sonosApi(`/${encodeURIComponent(other)}/join/${room}`);
        }
      }
      break;
    }
    case "ungroup":
      await sonosApi(`/${room}/leave`);
      break;
    case "play_favorite":
      await sonosApi(`/${room}/play`);
      break;
    default:
      break;
  }
}

// ---- Public gateway ---------------------------------------------------------

export interface SonosGateway {
  mode: string;
  getZones(): Promise<SonosZone[]>;
  apply(actions: AudioAction[]): Promise<void>;
  getQueue(zoneId: string): Promise<QueueTrack[]>;
  queueControl(zoneId: string, op: "play" | "remove", position: number): Promise<void>;
  getFavorites(): Promise<Favorite[]>;
  playFavorite(zoneId: string, favoriteId: string): Promise<void>;
  playSpotify(zoneId: string, uri: string, title?: string, mode?: "now" | "end"): Promise<void>;
  spotifyLinked(): boolean;
  playRadio(zoneId: string, url: string, name: string): Promise<void>;
  getEq(zoneId: string): Promise<EqState>;
  setEq(zoneId: string, field: keyof EqState, value: number | boolean): Promise<void>;
}

export const sonosGateway: SonosGateway = {
  get mode() {
    return directEnabled() ? "direct" : MODE();
  },
  async getZones() {
    if (directEnabled()) {
      return getDirectZones();
    }
    if (MODE() === "live") {
      return mapLiveZones(await sonosApi("/zones"));
    }
    return mockZones.map((z) => ({ ...z, groupedWith: [...z.groupedWith] }));
  },
  async apply(actions) {
    if (directEnabled()) {
      await applyDirect(actions);
      return;
    }
    if (MODE() === "live") {
      for (const a of actions) await commitLive(a);
      return;
    }
    for (const a of actions) applyMock(a);
  },
  async getQueue(zoneId) {
    if (directEnabled()) {
      return getDirectQueue(zoneId);
    }
    if (MODE() === "live") {
      const zones = await this.getZones();
      const room = zones.find((z) => z.id === zoneId)?.name ?? zoneId;
      return mapLiveQueue(await sonosApi(`/${encodeURIComponent(room)}/queue`));
    }
    return getMockQueue(zoneId);
  },
  async queueControl(zoneId, op, position) {
    if (directEnabled()) {
      await queueControlDirect(zoneId, op, position);
      return;
    }
    if (MODE() === "live") {
      const zones = await this.getZones();
      const room = encodeURIComponent(zones.find((z) => z.id === zoneId)?.name ?? zoneId);
      if (op === "play") await sonosApi(`/${room}/trackseek/${position}`);
      else await sonosApi(`/${room}/queueremove/${position - 1}`);
      return;
    }
    queueControlMock(zoneId, op, position);
  },
  async getFavorites() {
    if (directEnabled()) {
      return getDirectFavorites();
    }
    if (MODE() === "live") {
      const raw = await sonosApi("/favorites");
      return Array.isArray(raw) ? raw.map((t) => ({ id: String(t), title: String(t) })) : [];
    }
    return MOCK_FAVORITES;
  },
  async playFavorite(zoneId, favoriteId) {
    if (directEnabled()) {
      await playFavoriteDirect(zoneId, favoriteId);
      return;
    }
    if (MODE() === "live") {
      const zones = await this.getZones();
      const room = encodeURIComponent(zones.find((z) => z.id === zoneId)?.name ?? zoneId);
      await sonosApi(`/${room}/favorite/${encodeURIComponent(favoriteId)}`);
      return;
    }
    playFavoriteMock(zoneId, favoriteId);
  },
  async playSpotify(zoneId, uri, title, mode = "now") {
    if (directEnabled()) {
      await playSpotifyDirect(zoneId, uri, title, mode);
      return;
    }
    if (MODE() === "live") {
      const zones = await this.getZones();
      const room = encodeURIComponent(zones.find((z) => z.id === zoneId)?.name ?? zoneId);
      await sonosApi(`/${room}/spotify/${mode === "end" ? "queue" : "now"}/${encodeURIComponent(uri)}`);
      return;
    }
    const zone = zoneById(zoneId);
    if (zone && mode === "now") {
      zone.track = { title: title ?? "Spotify track", artist: "Spotify" };
      zone.playback = "playing";
      zone.duration = 0;
      zone.elapsed = 0;
    }
  },
  spotifyLinked() {
    return directEnabled() ? directSpotifyLinked() : true;
  },
  async playRadio(zoneId, url, name) {
    if (directEnabled()) {
      await playRadioDirect(zoneId, url, name);
      return;
    }
    if (MODE() === "live") {
      const zones = await this.getZones();
      const room = encodeURIComponent(zones.find((z) => z.id === zoneId)?.name ?? zoneId);
      await sonosApi(`/${room}/setavtransporturi/${encodeURIComponent(`x-rincon-mp3radio://${url.replace(/^https?:\/\//, "")}`)}`);
      return;
    }
    const zone = zoneById(zoneId);
    if (zone) {
      zone.track = { title: name, artist: "Radio" };
      zone.playback = "playing";
      zone.duration = 0;
      zone.elapsed = 0;
    }
  },
  async getEq(zoneId) {
    if (directEnabled()) return getEqDirect(zoneId);
    return mockEqFor(zoneId);
  },
  async setEq(zoneId, field, value) {
    if (directEnabled()) {
      await setEqDirect(zoneId, field, value);
      return;
    }
    const eq = mockEqFor(zoneId);
    (eq[field] as number | boolean) = value;
  },
};

/** Reset mock zones (used by /api/reset). */
export function resetMockZones(): void {
  mockZones = freshZones();
}
