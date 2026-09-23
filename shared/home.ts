import type { Device, HomeState, Room, RoomId } from "./types.ts";

export const ROOMS: Room[] = [
  { id: "living_room", name: "Living Room" },
  { id: "kitchen", name: "Kitchen" },
  { id: "bedroom", name: "Bedroom" },
  { id: "office", name: "Office" },
  { id: "bathroom", name: "Bathroom" },
  { id: "garage", name: "Garage" },
];

export const ROOM_NAME: Record<RoomId, string> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r.name]),
) as Record<RoomId, string>;

function d(device: Device): Device {
  return device;
}

export function createInitialHome(): HomeState {
  const devices: Device[] = [
    // Living Room
    d({ id: "lr-ceiling", name: "Ceiling Lights", room: "living_room", type: "light", on: true, level: 70 }),
    d({ id: "lr-lamp", name: "Corner Lamp", room: "living_room", type: "light", on: false, level: 40 }),
    d({ id: "lr-tv", name: "TV", room: "living_room", type: "media", on: false, intensity: 25 }),
    d({ id: "lr-blinds", name: "Blinds", room: "living_room", type: "blinds", on: true, level: 100 }),
    d({ id: "lr-thermostat", name: "Thermostat", room: "living_room", type: "thermostat", on: true, temperature: 71 }),

    // Kitchen
    d({ id: "kt-lights", name: "Kitchen Lights", room: "kitchen", type: "light", on: true, level: 100 }),
    d({ id: "kt-under", name: "Under-Cabinet", room: "kitchen", type: "light", on: false, level: 60 }),
    d({ id: "kt-speaker", name: "Speaker", room: "kitchen", type: "media", on: false, intensity: 30 }),

    // Bedroom
    d({ id: "bd-lights", name: "Bedroom Lights", room: "bedroom", type: "light", on: false, level: 50 }),
    d({ id: "bd-lamp", name: "Nightstand Lamp", room: "bedroom", type: "light", on: false, level: 20 }),
    d({ id: "bd-blinds", name: "Blinds", room: "bedroom", type: "blinds", on: false, level: 0 }),
    d({ id: "bd-fan", name: "Ceiling Fan", room: "bedroom", type: "fan", on: false, intensity: 0 }),
    d({ id: "bd-thermostat", name: "Thermostat", room: "bedroom", type: "thermostat", on: true, temperature: 68 }),

    // Office
    d({ id: "of-lights", name: "Office Lights", room: "office", type: "light", on: true, level: 85 }),
    d({ id: "of-blinds", name: "Blinds", room: "office", type: "blinds", on: true, level: 60 }),

    // Bathroom
    d({ id: "ba-lights", name: "Bathroom Lights", room: "bathroom", type: "light", on: false, level: 80 }),
    d({ id: "ba-fan", name: "Exhaust Fan", room: "bathroom", type: "fan", on: false, intensity: 0 }),

    // Garage
    d({ id: "gr-lights", name: "Garage Lights", room: "garage", type: "light", on: false, level: 100 }),
    d({ id: "gr-lock", name: "Garage Door", room: "garage", type: "lock", on: false, locked: true }),
    d({ id: "fd-lock", name: "Front Door", room: "living_room", type: "lock", on: false, locked: true }),
  ];

  return { rooms: ROOMS, devices };
}
