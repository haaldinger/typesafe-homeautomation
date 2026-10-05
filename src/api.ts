// Client for the Aura Express backend (server/index.ts).
//
// Every call goes to the real /api/* endpoints. By default requests are
// relative ("/api/...") and reach the server through the Vite dev proxy.
// An optional base URL (Settings) can point at a backend on another host;
// the server enables CORS, so that works without the proxy.

import type {
  CommandResponse,
  DeviceAction,
  EqState,
  Favorite,
  FlightResponse,
  HomeState,
  PatternKind,
  QueueTrack,
  RunningPattern,
  RadioStation,
  SonosZone,
  SpotifyResult,
} from "../shared/types.ts";

const BACKEND_URL_KEY = "aura.backend_url";

export function getCustomBackendUrl(): string | null {
  try {
    return localStorage.getItem(BACKEND_URL_KEY);
  } catch {
    return null;
  }
}

export function setCustomBackendUrl(url: string | null): void {
  try {
    if (url) localStorage.setItem(BACKEND_URL_KEY, url);
    else localStorage.removeItem(BACKEND_URL_KEY);
  } catch {
    // Storage unavailable (private mode etc.) — fall back to the proxy.
  }
}

function apiUrl(path: string): string {
  const base = (getCustomBackendUrl() ?? "").trim().replace(/\/+$/, "");
  return `${base}${path}`;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

async function getJson<T>(path: string, what: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw await errorFrom(res, `${what} failed`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown, what: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFrom(res, `${what} failed`);
  return res.json() as Promise<T>;
}

/** GET /api/health */
export interface HealthInfo {
  ok: boolean;
  typesafe: boolean;
  llm: boolean;
  gateway: string;
  /** "mock" | "live" | "direct" */
  sonos?: string;
  spotify?: boolean;
  spotifyLinked?: boolean;
  /** "demo" = simulated house + mock speakers; "home" = real devices from .env. */
  profile?: "demo" | "home";
}

export const setProfile = (profile: "demo" | "home") =>
  postJson<{ profile: string; gateway: string; sonos: string }>("/api/profile", { profile }, "switch mode");

/** GET /api/stations */
export interface StationInfo {
  id: string;
  name: string;
  category?: string;
}

export const fetchHealth = () => getJson<HealthInfo>("/api/health", "health");
export const fetchHome = () => getJson<HomeState>("/api/home", "home");
export const fetchZones = () => getJson<SonosZone[]>("/api/zones", "zones");
export const fetchStations = () => getJson<StationInfo[]>("/api/stations", "stations");
export const fetchFlights = () => getJson<FlightResponse>("/api/flights", "flights");

export const fetchPatterns = () => getJson<RunningPattern[]>("/api/patterns", "patterns");
export const startPattern = (room: string, kind: PatternKind, colors?: string[]) =>
  postJson<RunningPattern[]>("/api/patterns", { room, kind, colors }, "start pattern");
export const stopPattern = (room: string) => postJson<RunningPattern[]>("/api/patterns/stop", { room }, "stop pattern");

/** zoneId -> roomId whose lights follow that zone's album art. */
export const fetchLightSync = () => getJson<Record<string, string>>("/api/light-sync", "light sync");
export const updateLightSync = (zoneId: string, roomId: string | null) =>
  postJson<Record<string, string>>("/api/light-sync", { zoneId, roomId }, "light sync");

/** Push manual device changes to a real gateway; returns the refreshed home. */
export const controlDevices = (actions: DeviceAction[]) =>
  postJson<HomeState>("/api/device", { actions }, "device control");

/** Direct (non-NL) zone control: play/pause/next/previous/set_volume/play_station/group/ungroup. */
export function zoneControl(
  zoneId: string,
  action: string,
  value?: number,
  station?: string,
  members?: string[],
): Promise<SonosZone[]> {
  return postJson<SonosZone[]>("/api/zone-control", { zoneId, action, value, station, members }, "zone-control");
}

/** Join `memberIds` to the `leadZoneId` coordinator (zone-control "group"). */
export function groupZones(leadZoneId: string, memberIds: string[]): Promise<SonosZone[]> {
  return zoneControl(leadZoneId, "group", undefined, undefined, memberIds);
}

/** Remove a zone from its group (zone-control "ungroup"). */
export function ungroupZone(zoneId: string): Promise<SonosZone[]> {
  return zoneControl(zoneId, "ungroup");
}

export function fetchQueue(zoneId: string): Promise<QueueTrack[]> {
  return getJson<QueueTrack[]>(`/api/zones/${encodeURIComponent(zoneId)}/queue`, "queue fetch");
}

/** `position` is 1-based, matching QueueTrack.position. */
export function queueControl(zoneId: string, op: "play" | "remove", position: number): Promise<QueueTrack[]> {
  return postJson<QueueTrack[]>("/api/queue-control", { zoneId, op, position }, "queue-control");
}

export async function fetchFavorites(): Promise<Favorite[]> {
  try {
    return await getJson<Favorite[]>("/api/favorites", "favorites");
  } catch {
    return [];
  }
}

export function playFavorite(zoneId: string, id: string): Promise<SonosZone[]> {
  return postJson<SonosZone[]>("/api/favorite", { zoneId, id }, "favorite");
}

export function searchSpotify(q: string): Promise<SpotifyResult[]> {
  return getJson<SpotifyResult[]>(`/api/spotify/search?q=${encodeURIComponent(q)}`, "search");
}

export function playSpotify(
  zoneId: string,
  uri: string,
  title: string,
  mode: "now" | "end" = "now",
): Promise<SonosZone[]> {
  return postJson<SonosZone[]>("/api/spotify/play", { zoneId, uri, title, mode }, "play");
}

export interface SyncedLine {
  time: number;
  text: string;
}
export interface Lyrics {
  synced: SyncedLine[];
  plain: string;
  source: string;
}

/** "More like this": playable Spotify tracks similar to the given artist. */
export const fetchSuggestions = (artist: string, title: string) =>
  getJson<SpotifyResult[]>(`/api/suggest?${new URLSearchParams({ artist, title })}`, "suggestions");

export async function fetchLyrics(artist: string, title: string, duration = 0): Promise<Lyrics | null> {
  const res = await fetch(
    apiUrl(
      `/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}&duration=${duration}`,
    ),
  );
  if (!res.ok) return null;
  return res.json() as Promise<Lyrics | null>;
}

export function searchRadio(q: string): Promise<RadioStation[]> {
  return getJson<RadioStation[]>(`/api/radio/search?q=${encodeURIComponent(q)}`, "radio search");
}

export function playRadio(zoneId: string, url: string, name: string): Promise<SonosZone[]> {
  return postJson<SonosZone[]>("/api/radio/play", { zoneId, url, name }, "radio play");
}

export function playTv(zoneId: string): Promise<SonosZone[]> {
  return postJson<SonosZone[]>(`/api/zones/${encodeURIComponent(zoneId)}/tv`, {}, "return to TV");
}

export function fetchEq(zoneId: string): Promise<EqState> {
  return getJson<EqState>(`/api/zones/${encodeURIComponent(zoneId)}/eq`, "eq fetch");
}

export function setEq(
  zoneId: string,
  field: keyof EqState,
  value: number | boolean,
): Promise<EqState> {
  return postJson<EqState>("/api/eq", { zoneId, field, value }, "eq");
}

/** Natural-language command through TypeSafe. `home` lets the simulator gateway use client-side edits. */
/** `overrides` carries the user's pick from a follow-up question (question id -> choice). */
export function sendCommand(request: string, home: HomeState, overrides?: Record<string, string>): Promise<CommandResponse> {
  return postJson<CommandResponse>("/api/command", { request, home, overrides }, "Request");
}
