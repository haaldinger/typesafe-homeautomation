import type { CommandResponse, EqState, Favorite, HomeState, QueueTrack, RadioStation, SonosZone, SpotifyResult } from "../shared/types.ts";

export interface HealthInfo {
  ok: boolean;
  typesafe: boolean;
  llm: boolean;
  gateway: string;
  sonos?: string;
  spotify?: boolean;
  spotifyLinked?: boolean;
}

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch("/api/health");
  return res.json();
}

export async function fetchHome(): Promise<HomeState> {
  const res = await fetch("/api/home");
  return res.json();
}

export async function fetchZones(): Promise<SonosZone[]> {
  const res = await fetch("/api/zones");
  return res.json();
}

export interface StationInfo {
  id: string;
  name: string;
  category?: string;
}

export async function fetchStations(): Promise<StationInfo[]> {
  const res = await fetch("/api/stations");
  return res.json();
}

export async function zoneControl(
  zoneId: string,
  action: string,
  value?: number,
  station?: string,
): Promise<SonosZone[]> {
  const res = await fetch("/api/zone-control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zoneId, action, value, station }),
  });
  if (!res.ok) throw new Error(`zone-control failed (${res.status})`);
  return res.json();
}

export async function fetchQueue(zoneId: string): Promise<QueueTrack[]> {
  const res = await fetch(`/api/zones/${encodeURIComponent(zoneId)}/queue`);
  if (!res.ok) throw new Error(`queue fetch failed (${res.status})`);
  return res.json();
}

export async function queueControl(
  zoneId: string,
  op: "play" | "remove",
  position: number,
): Promise<QueueTrack[]> {
  const res = await fetch("/api/queue-control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zoneId, op, position }),
  });
  if (!res.ok) throw new Error(`queue-control failed (${res.status})`);
  return res.json();
}

export async function fetchFavorites(): Promise<Favorite[]> {
  const res = await fetch("/api/favorites");
  if (!res.ok) return [];
  return res.json();
}

export async function playFavorite(zoneId: string, id: string): Promise<SonosZone[]> {
  const res = await fetch("/api/favorite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zoneId, id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `favorite failed (${res.status})`);
  }
  return res.json();
}

export async function searchSpotify(q: string): Promise<SpotifyResult[]> {
  const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `search failed (${res.status})`);
  }
  return res.json();
}

export async function playSpotify(
  zoneId: string,
  uri: string,
  title: string,
  mode: "now" | "end" = "now",
): Promise<SonosZone[]> {
  const res = await fetch("/api/spotify/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zoneId, uri, title, mode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `play failed (${res.status})`);
  }
  return res.json();
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

export async function fetchLyrics(artist: string, title: string, duration = 0): Promise<Lyrics | null> {
  const res = await fetch(
    `/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}&duration=${duration}`,
  );
  if (!res.ok) return null;
  return res.json();
}

export async function searchRadio(q: string): Promise<RadioStation[]> {
  const res = await fetch(`/api/radio/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `radio search failed (${res.status})`);
  }
  return res.json();
}

export async function playRadio(zoneId: string, url: string, name: string): Promise<SonosZone[]> {
  const res = await fetch("/api/radio/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zoneId, url, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `radio play failed (${res.status})`);
  }
  return res.json();
}

export async function fetchEq(zoneId: string): Promise<EqState> {
  const res = await fetch(`/api/zones/${encodeURIComponent(zoneId)}/eq`);
  if (!res.ok) return { bass: 0, treble: 0, night: false, loudness: true };
  return res.json();
}

export async function setEq(
  zoneId: string,
  field: "bass" | "treble" | "night" | "loudness",
  value: number | boolean,
): Promise<EqState> {
  const res = await fetch("/api/eq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zoneId, field, value }),
  });
  if (!res.ok) throw new Error(`eq failed (${res.status})`);
  return res.json();
}

export async function sendCommand(request: string, home: HomeState): Promise<CommandResponse> {
  const res = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request, home }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}
