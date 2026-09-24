// "More like this": similar artists come from Deezer's free public API (Spotify's
// recommendation endpoints are closed to Development-mode apps), then each pick is
// matched to a playable Spotify track via search.

import type { SpotifyResult } from "../shared/types.ts";
import { searchSpotify } from "./spotify.ts";

const DEEZER = "https://api.deezer.com";
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; tracks: SpotifyResult[] }>();

interface DeezerArtist {
  id: number;
  name: string;
}
interface DeezerTrack {
  title: string;
  artist: { name: string };
}

async function deezer<T>(path: string): Promise<T[]> {
  const res = await fetch(`${DEEZER}${path}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: T[] };
  return body.data ?? [];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();

/** Find the Spotify version of a track, if there is one. */
async function onSpotify(title: string, artist: string): Promise<SpotifyResult | null> {
  const [hit] = await searchSpotify(`track:"${norm(title)}" artist:"${artist}"`, 1).catch(() => []);
  return hit ?? null;
}

/** Up to ~10 playable tracks similar to the given artist, skipping the current song. */
export async function suggestFor(artistField: string, currentTitle = ""): Promise<SpotifyResult[]> {
  const artistName = artistField.split(/,|&| feat\.? /i)[0].trim();
  if (!artistName) return [];
  const key = artistName.toLowerCase();
  const hit = cache.get(key);
  const skip = norm(currentTitle);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tracks.filter((t) => norm(t.name) !== skip);

  const [artist] = await deezer<DeezerArtist>(`/search/artist?q=${encodeURIComponent(artistName)}&limit=1`);
  if (!artist) return [];
  const [related, own] = await Promise.all([
    deezer<DeezerArtist>(`/artist/${artist.id}/related?limit=8`),
    deezer<DeezerTrack>(`/artist/${artist.id}/top?limit=5`),
  ]);

  // One top song from each similar artist, plus a couple from the artist itself.
  const picks: { title: string; artist: string; reason: string }[] = [];
  const tops = await Promise.all(related.map((a) => deezer<DeezerTrack>(`/artist/${a.id}/top?limit=1`)));
  tops.forEach((t, i) => {
    if (t[0]) picks.push({ title: t[0].title, artist: related[i].name, reason: `Similar to ${artist.name}` });
  });
  for (const t of own.filter((t) => norm(t.title) !== skip).slice(0, 2)) {
    picks.push({ title: t.title, artist: artist.name, reason: `More from ${artist.name}` });
  }

  const matched = await Promise.all(
    picks.map(async (p): Promise<SpotifyResult | null> => {
      const s = await onSpotify(p.title, p.artist);
      return s ? { ...s, reason: p.reason } : null;
    }),
  );
  const tracks = matched.filter((t): t is SpotifyResult => t !== null);
  cache.set(key, { at: Date.now(), tracks });
  return tracks.filter((t) => norm(t.name) !== skip);
}
