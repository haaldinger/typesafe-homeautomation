import type { CSSProperties } from "react";

/** Deterministic gradient cover derived from a seed string (used when there's no album art). */
export function coverStyle(seed: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 60 + ((h >> 8) % 120)) % 360;
  return { background: `linear-gradient(135deg, hsl(${a} 70% 45%), hsl(${b} 65% 30%))` };
}

/** Seconds -> m:ss */
export function fmtTime(sec: number | undefined): string {
  if (!sec || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
