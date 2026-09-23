// Lyrics lookup. Uses lrclib.net for time-synced (LRC) lyrics with a plain-text
// fallback, then lyrics.ovh as a last resort. No API key required.

export interface SyncedLine {
  /** Seconds into the track. */
  time: number;
  text: string;
}

export interface Lyrics {
  synced: SyncedLine[];
  plain: string;
  source: string;
}

const cache = new Map<string, Lyrics | null>();

function parseLrc(lrc: string): SyncedLine[] {
  const out: SyncedLine[] = [];
  for (const raw of lrc.split("\n")) {
    const line = raw.trim();
    const re = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
    let m: RegExpExecArray | null;
    const stamps: number[] = [];
    let lastIndex = 0;
    while ((m = re.exec(line))) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0;
      stamps.push(min * 60 + sec + frac);
      lastIndex = re.lastIndex;
    }
    const text = line.slice(lastIndex).trim();
    if (stamps.length && text) for (const t of stamps) out.push({ time: t, text });
  }
  return out.sort((a, b) => a.time - b.time);
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Aura/1.0 (smart-home demo)" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function fetchLyrics(artist: string, title: string, duration = 0): Promise<Lyrics | null> {
  const key = `${artist}|${title}`.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  let result: Lyrics | null = null;
  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    if (duration) params.set("duration", String(Math.round(duration)));
    // Exact match first, then a fuzzy search.
    let hit = await getJson(`https://lrclib.net/api/get?${params.toString()}`);
    if (!hit) {
      const list = await getJson(
        `https://lrclib.net/api/search?${new URLSearchParams({ artist_name: artist, track_name: title }).toString()}`,
      );
      if (Array.isArray(list) && list.length) hit = list[0];
    }
    if (hit && (hit.syncedLyrics || hit.plainLyrics)) {
      result = {
        synced: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : [],
        plain: hit.plainLyrics ?? "",
        source: "lrclib.net",
      };
    }
  } catch {
    // fall through to lyrics.ovh
  }

  if (!result) {
    try {
      const ov = await getJson(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      );
      if (ov?.lyrics) result = { synced: [], plain: ov.lyrics, source: "lyrics.ovh" };
    } catch {
      // give up
    }
  }

  cache.set(key, result);
  return result;
}
