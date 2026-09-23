// Spotify Web API search via the Client Credentials flow (no user login needed).
// Only used for searching/metadata; playback on Sonos is handled separately.

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  art?: string;
  durationMs: number;
}

function creds(): { id: string; secret: string } | null {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

export function spotifyConfigured(): boolean {
  return creds() !== null;
}

let token: { value: string; expires: number } | null = null;

export interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  art?: string;
}

// Metadata by track id. Populated from search results (the /tracks endpoint is
// blocked for Development-mode apps), then reused for queue / now-playing.
const trackCache = new Map<string, TrackMeta | null>();

async function getToken(): Promise<string | null> {
  const c = creds();
  if (!c) return null;
  if (token && token.expires > Date.now() + 5000) return token.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Spotify auth ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function searchSpotify(query: string, limit = 10): Promise<SpotifyTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const tok = await getToken();
  if (!tok) return [];
  const url = `https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: "track", limit: String(limit) })}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tok}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Spotify search ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const items: any[] = data?.tracks?.items ?? [];
  return items.map((t) => {
    const track: SpotifyTrack = {
      id: t.id,
      uri: t.uri,
      name: t.name,
      artist: (t.artists ?? []).map((a: any) => a.name).join(", "),
      album: t.album?.name ?? "",
      art: t.album?.images?.[0]?.url,
      durationMs: t.duration_ms ?? 0,
    };
    trackCache.set(track.id, { title: track.name, artist: track.artist, album: track.album, art: track.art });
    return track;
  });
}

/** Resolve Spotify track metadata by id (from the search-populated cache). */
export async function getSpotifyTracks(ids: string[]): Promise<Map<string, TrackMeta>> {
  const out = new Map<string, TrackMeta>();
  for (const id of ids) {
    const m = trackCache.get(id);
    if (m) out.set(id, m);
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
