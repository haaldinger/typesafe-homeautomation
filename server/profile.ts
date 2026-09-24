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

let profile: Profile = load();

export const getProfile = (): Profile => profile;
export const isDemo = (): boolean => profile === "demo";

export function setProfile(next: Profile): void {
  profile = next;
  try {
    writeFileSync(FILE, JSON.stringify({ profile }));
  } catch {
    // Best-effort; the switch still applies until restart.
  }
}
