// Live internet-radio directory search via the community Radio Browser API.
// No API key required. https://www.radio-browser.info/

import type { RadioStation } from "../shared/types.ts";

const HOSTS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function searchRadio(query: string, limit = 20): Promise<RadioStation[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    name: q,
    limit: String(limit),
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
  });
  let lastErr: unknown = null;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/json/stations/search?${params}`, {
        headers: { "User-Agent": "Aura/1.0 (smart-home demo)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`radio ${res.status}`);
      const data = (await res.json()) as any[];
      return data
        .filter((s) => s.url_resolved || s.url)
        .map((s) => ({
          id: s.stationuuid,
          name: s.name?.trim() || "Unknown station",
          url: s.url_resolved || s.url,
          favicon: s.favicon || undefined,
          country: s.country || undefined,
          bitrate: s.bitrate || undefined,
          codec: s.codec || undefined,
        }));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Radio search failed");
}
/* eslint-enable @typescript-eslint/no-explicit-any */
