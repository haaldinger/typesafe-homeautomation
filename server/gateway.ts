// Pluggable device backend. The simulator keeps client-provided state (default,
// reliable for demos); the Home Assistant gateway reads and drives real devices.
// Select with GATEWAY=sim | homeassistant | hue in .env.

import type { DeviceAction, HomeState } from "../shared/types.ts";
import { createInitialHome } from "../shared/home.ts";
import { commitToHomeAssistant, loadHomeAssistantState } from "./homeassistant.ts";
import { commitToHue, loadHueState } from "./hue.ts";

export interface DeviceGateway {
  name: string;
  /** Load the current home. The simulator trusts the client's copy. */
  loadState(clientHome?: HomeState): Promise<HomeState>;
  /** Push the decided actions to real devices. No-op for the simulator. */
  commit(actions: DeviceAction[]): Promise<void>;
}

const simGateway: DeviceGateway = {
  name: "sim",
  async loadState(clientHome) {
    return clientHome ?? createInitialHome();
  },
  async commit() {
    // The client applies the returned home state; nothing to push.
  },
};

const hueGateway: DeviceGateway = {
  name: "hue",
  async loadState() {
    return loadHueState();
  },
  async commit(actions) {
    await commitToHue(actions);
  },
};

const homeAssistantGateway: DeviceGateway = {
  name: "homeassistant",
  async loadState() {
    return loadHomeAssistantState();
  },
  async commit(actions) {
    await commitToHomeAssistant(actions);
  },
};

export function getGateway(): DeviceGateway {
  const kind = (process.env.GATEWAY ?? "sim").toLowerCase();
  if (kind === "homeassistant" || kind === "hass" || kind === "ha") return homeAssistantGateway;
  if (kind === "hue") return hueGateway;
  return simGateway;
}
