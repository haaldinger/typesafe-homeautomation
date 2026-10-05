// Demo vs Home: "demo" forces the simulated house and mock speakers so Aura runs
// anywhere; "home" uses whatever .env configures (Hue / Home Assistant, real Sonos).
// Switchable at runtime from the settings screen and saved to .aura-profile.json.

import { readFileSync, writeFileSync } from "node:fs";

export type Profile = "demo" | "home";

const FILE = new URL("../.aura-profile.json", import.meta.url);

function load(): Profile {
  try {
    const p = (JSON.parse(readFileSync(FILE, "utf8")) as { profile?: string }).profile;
    return p === "demo" ? "demo" : "home";
  } catch {
    return "home";
  }
}

// AURA_PROFILE=demo|home pins the mode for this process (e.g. a second test
// instance) without reading or rewriting the shared .aura-profile.json.
const pinned = process.env.AURA_PROFILE === "demo" || process.env.AURA_PROFILE === "home" ? process.env.AURA_PROFILE : undefined;

let profile: Profile = pinned ?? load();

export const getProfile = (): Profile => profile;
export const isDemo = (): boolean => profile === "demo";

export function setProfile(next: Profile): void {
  profile = next;
  if (pinned) return;
  try {
    writeFileSync(FILE, JSON.stringify({ profile }));
  } catch {
    // Best-effort; the switch still applies until restart.
  }
}
