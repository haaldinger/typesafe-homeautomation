// Pluggable device backend. The simulator keeps client-provided state (default,
// reliable for demos); the Home Assistant gateway reads and drives real devices.
// Select with GATEWAY=sim | homeassistant in .env.

import type { DeviceAction, HomeState } from "../shared/types.ts";
import { createInitialHome } from "../shared/home.ts";
import { commitToHomeAssistant, loadHomeAssistantState } from "./homeassistant.ts";

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
  return simGateway;
}
