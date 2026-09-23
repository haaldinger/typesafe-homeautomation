// Home Assistant REST integration: discover devices + areas in one templated
// call, and execute actions by calling HA services. The long-lived access token
// stays server-side.

import type { Device, DeviceAction, DeviceType, HomeState, Room } from "../shared/types.ts";

const baseUrl = () => (process.env.HASS_URL ?? "http://localhost:8123").replace(/\/$/, "");
const token = () => process.env.HASS_TOKEN ?? "";

const DOMAIN_TYPE: Record<string, DeviceType> = {
  light: "light",
  lock: "lock",
  cover: "blinds",
  climate: "thermostat",
  fan: "fan",
  media_player: "media",
};

const MEDIA_OFF = ["off", "idle", "standby", "unavailable", "unknown"];

// One template returns every relevant entity with its area, state, and attributes.
const DISCOVERY_TEMPLATE = `
{%- set ns = namespace(items=[]) -%}
{%- for s in states -%}
  {%- if s.domain in ['light','lock','cover','climate','fan','media_player'] -%}
    {%- set ns.items = ns.items + [{'entity_id': s.entity_id, 'name': s.name, 'domain': s.domain, 'area': area_name(s.entity_id), 'state': s.state, 'attributes': s.attributes}] -%}
  {%- endif -%}
{%- endfor -%}
{{ ns.items | tojson }}
`;

interface HAEntity {
  entity_id: string;
  name: string;
  domain: string;
  area: string | null;
  state: string;
  attributes: Record<string, unknown>;
}

async function ha(path: string, init?: RequestInit): Promise<Response> {
  if (!token()) {
    throw new Error("HASS_TOKEN is not set. Add a Home Assistant long-lived token to .env.");
  }
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Home Assistant ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return res;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unassigned";
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function toDevice(e: HAEntity): Device {
  const type = DOMAIN_TYPE[e.domain];
  const attrs = e.attributes ?? {};
  const room = e.area ? slug(e.area) : "unassigned";
  const base: Device = { id: e.entity_id, name: e.name || e.entity_id, room, type, on: false };

  switch (type) {
    case "light": {
      const brightness = num(attrs.brightness);
      return { ...base, on: e.state === "on", level: brightness !== undefined ? Math.round((brightness / 255) * 100) : undefined };
    }
    case "fan":
      return { ...base, on: e.state === "on", intensity: num(attrs.percentage) };
    case "media": {
      const vol = num(attrs.volume_level);
      return { ...base, on: !MEDIA_OFF.includes(e.state), intensity: vol !== undefined ? Math.round(vol * 100) : undefined };
    }
    case "blinds": {
      const pos = num(attrs.current_position);
      return { ...base, on: e.state === "open", level: pos ?? (e.state === "open" ? 100 : 0) };
    }
    case "thermostat":
      return { ...base, on: e.state !== "off", temperature: num(attrs.temperature) ?? num(attrs.current_temperature) };
    case "lock":
      return { ...base, on: false, locked: e.state === "locked" };
    default:
      return base;
  }
}

export async function loadHomeAssistantState(): Promise<HomeState> {
  const res = await ha("/api/template", {
    method: "POST",
    body: JSON.stringify({ template: DISCOVERY_TEMPLATE }),
  });
  const entities = JSON.parse(await res.text()) as HAEntity[];
  const devices = entities.filter((e) => DOMAIN_TYPE[e.domain]).map(toDevice);

  const roomMap = new Map<string, Room>();
  for (const e of entities) {
    const name = e.area ?? "Unassigned";
    const id = e.area ? slug(e.area) : "unassigned";
    if (!roomMap.has(id)) roomMap.set(id, { id, name });
  }
  const rooms = [...roomMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { rooms, devices };
}

interface ServiceCall {
  service: string;
  data?: Record<string, unknown>;
}

function mapService(domain: string, patch: DeviceAction["patch"]): ServiceCall | null {
  switch (domain) {
    case "light":
      if (patch.on === false || patch.level === 0) return { service: "turn_off" };
      if (patch.level !== undefined) return { service: "turn_on", data: { brightness_pct: patch.level } };
      if (patch.on === true) return { service: "turn_on" };
      return null;
    case "lock":
      if (patch.locked === true) return { service: "lock" };
      if (patch.locked === false) return { service: "unlock" };
      return null;
    case "cover":
      if (patch.on === false || patch.level === 0) return { service: "close_cover" };
      if (patch.level !== undefined) return { service: "set_cover_position", data: { position: patch.level } };
      if (patch.on === true) return { service: "open_cover" };
      return null;
    case "climate":
      if (patch.temperature !== undefined) return { service: "set_temperature", data: { temperature: patch.temperature } };
      if (patch.on === false) return { service: "turn_off" };
      if (patch.on === true) return { service: "turn_on" };
      return null;
    case "fan":
      if (patch.on === false || patch.intensity === 0) return { service: "turn_off" };
      if (patch.intensity !== undefined) return { service: "set_percentage", data: { percentage: patch.intensity } };
      if (patch.on === true) return { service: "turn_on" };
      return null;
    case "media_player":
      if (patch.on === false) return { service: "turn_off" };
      if (patch.intensity !== undefined) return { service: "volume_set", data: { volume_level: patch.intensity / 100 } };
      if (patch.on === true) return { service: "turn_on" };
      return null;
    default:
      return null;
  }
}

export async function commitToHomeAssistant(actions: DeviceAction[]): Promise<void> {
  for (const action of actions) {
    const domain = action.deviceId.split(".")[0];
    const call = mapService(domain, action.patch);
    if (!call) continue;
    await ha(`/api/services/${domain}/${call.service}`, {
      method: "POST",
      body: JSON.stringify({ entity_id: action.deviceId, ...call.data }),
    });
  }
}
