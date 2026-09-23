import type {
  AnswerTrace,
  AudioAction,
  CommandResolution,
  Device,
  DeviceAction,
  DistributionEntry,
  HomeState,
  SonosZone,
} from "../shared/types.ts";
import { ROOM_NAME } from "../shared/home.ts";
import { stationById } from "./stations.ts";
import type {
  Answer,
  ChoiceAnswer,
  NoulAnswer,
  Question,
  ScoreAnswer,
  SystemOneResponse,
} from "./typesafe.ts";
import { QUESTION_LABELS } from "./typesafe.ts";

function choice(r: SystemOneResponse, id: string): ChoiceAnswer {
  return r.answers[id] as ChoiceAnswer;
}
function score(r: SystemOneResponse, id: string): ScoreAnswer {
  return r.answers[id] as ScoreAnswer;
}
function noul(r: SystemOneResponse, id: string): NoulAnswer {
  return r.answers[id] as NoulAnswer;
}

/** Pull the natural-language question out of a Question definition. */
function questionText(q?: Question): string {
  if (!q) return "";
  const ins = q.instructions;
  if (typeof ins === "string") return ins;
  if (ins && typeof ins === "object" && !Array.isArray(ins) && "question" in ins) {
    return String((ins as { question: unknown }).question);
  }
  return JSON.stringify(ins);
}

/** Round a Score's position to the nearest brightness percentage. */
function brightnessFromScore(s: number): number {
  const pct = [0, 25, 55, 80, 100];
  const idx = Math.max(0, Math.min(4, Math.round(s)));
  return pct[idx];
}

function targetDevices(
  home: HomeState,
  scope: string,
  room: string,
  deviceType: string,
): Device[] {
  let devices = home.devices;
  if (scope === "room" && room !== "none") {
    devices = devices.filter((d) => d.room === room);
  } else if (room !== "none") {
    // A room was named even if scope wasn't explicitly "room".
    devices = devices.filter((d) => d.room === room);
  }
  if (deviceType !== "none") {
    devices = devices.filter((d) => d.type === deviceType);
  }
  return devices;
}

function applyAction(
  device: Device,
  action: string,
  r: SystemOneResponse,
): Partial<Device> | null {
  switch (device.type) {
    case "light":
      if (action === "turn_on") return { on: true };
      if (action === "turn_off") return { on: false };
      if (action === "toggle") return { on: !device.on };
      if (action === "set_level") {
        const level = brightnessFromScore(score(r, "brightness_level").score);
        return { on: level > 0, level };
      }
      if (action === "increase") return { on: true, level: Math.min(100, (device.level ?? 0) + 20) };
      if (action === "decrease") {
        const level = Math.max(0, (device.level ?? 0) - 20);
        return { on: level > 0, level };
      }
      return null;

    case "thermostat": {
      if (action === "increase") return { temperature: (device.temperature ?? 70) + 2 };
      if (action === "decrease") return { temperature: (device.temperature ?? 70) - 2 };
      if (action === "set_level") {
        const dir = score(r, "temperature_direction").score; // 0..4, 2 = keep
        const delta = Math.round((dir - 2) * 3);
        return { temperature: (device.temperature ?? 70) + delta };
      }
      if (action === "turn_off") return { on: false };
      if (action === "turn_on") return { on: true };
      return null;
    }

    case "lock":
      if (action === "lock" || action === "close" || action === "turn_on") return { locked: true, on: false };
      if (action === "unlock" || action === "open" || action === "turn_off") return { locked: false, on: true };
      if (action === "toggle") return { locked: !device.locked, on: !!device.locked };
      return null;

    case "blinds":
      if (action === "open" || action === "turn_on" || action === "increase") return { on: true, level: 100 };
      if (action === "close" || action === "turn_off" || action === "decrease") return { on: false, level: 0 };
      if (action === "set_level") {
        const level = brightnessFromScore(score(r, "brightness_level").score);
        return { on: level > 0, level };
      }
      if (action === "toggle") return { on: !device.on, level: device.on ? 0 : 100 };
      return null;

    case "fan":
      if (action === "turn_on" || action === "increase") return { on: true, intensity: Math.min(100, (device.intensity ?? 0) + 40 || 60) };
      if (action === "turn_off") return { on: false, intensity: 0 };
      if (action === "decrease") {
        const intensity = Math.max(0, (device.intensity ?? 0) - 30);
        return { on: intensity > 0, intensity };
      }
      if (action === "toggle") return { on: !device.on, intensity: device.on ? 0 : 60 };
      return null;

    case "media":
      if (action === "turn_on") return { on: true };
      if (action === "turn_off") return { on: false };
      if (action === "toggle") return { on: !device.on };
      if (action === "increase") return { on: true, intensity: Math.min(100, (device.intensity ?? 0) + 15) };
      if (action === "decrease") return { intensity: Math.max(0, (device.intensity ?? 0) - 15) };
      return null;

    default:
      return null;
  }
}

const SCENES: Record<string, (home: HomeState) => DeviceAction[]> = {
  movie_night: (home) =>
    home.devices.flatMap((dev) => {
      if (dev.room === "living_room" && dev.type === "light") return [act(dev, { on: true, level: 20 }, "dimmed for movie night")];
      if (dev.room === "living_room" && dev.type === "blinds") return [act(dev, { on: false, level: 0 }, "closed")];
      if (dev.id === "lr-tv") return [act(dev, { on: true }, "turned on")];
      return [];
    }),
  good_morning: (home) =>
    home.devices.flatMap((dev) => {
      if (dev.type === "blinds") return [act(dev, { on: true, level: 100 }, "opened")];
      if (dev.type === "light" && (dev.room === "kitchen" || dev.room === "bedroom")) return [act(dev, { on: true, level: 80 }, "turned on")];
      return [];
    }),
  good_night: (home) =>
    home.devices.flatMap((dev) => {
      if (dev.type === "light") return [act(dev, { on: false }, "turned off")];
      if (dev.type === "media") return [act(dev, { on: false }, "turned off")];
      if (dev.type === "lock") return [act(dev, { locked: true, on: false }, "locked")];
      if (dev.id === "bd-thermostat") return [act(dev, { temperature: 66 }, "set to 66°")];
      return [];
    }),
  away: (home) =>
    home.devices.flatMap((dev) => {
      if (dev.type === "light" || dev.type === "media" || dev.type === "fan") return [act(dev, { on: false, intensity: 0 }, "turned off")];
      if (dev.type === "lock") return [act(dev, { locked: true, on: false }, "locked")];
      if (dev.type === "blinds") return [act(dev, { on: false, level: 0 }, "closed")];
      return [];
    }),
};

function act(device: Device, patch: Partial<Device>, verb: string, roomName?: string): DeviceAction {
  const label = roomName ?? ROOM_NAME[device.room] ?? device.room;
  return {
    deviceId: device.id,
    deviceName: device.name,
    room: device.room,
    summary: `${device.name} (${label}) ${verb}`,
    patch,
  };
}

function describePatch(device: Device, patch: Partial<Device>): string {
  if (patch.locked !== undefined) return patch.locked ? "locked" : "unlocked";
  if (patch.temperature !== undefined) return `set to ${patch.temperature}°`;
  if (device.type === "blinds" && patch.level !== undefined) return patch.level > 0 ? `opened to ${patch.level}%` : "closed";
  if (patch.level !== undefined && patch.on) return `set to ${patch.level}%`;
  if (patch.intensity !== undefined && patch.on) return `set to ${patch.intensity}%`;
  if (patch.on === true) return "turned on";
  if (patch.on === false) return "turned off";
  return "adjusted";
}

/** Normalize an answer into a sorted probability distribution for display. */
function distributionOf(a: Answer): DistributionEntry[] {
  if (a.type === "choice") {
    return Object.entries(a.probabilities)
      .sort((x, y) => y[1] - x[1])
      .map(([label, p]) => ({ label, p, top: label === a.choice }));
  }
  if (a.type === "score") {
    const topLevel = String(Math.round(a.score));
    return Object.entries(a.probabilities)
      .sort((x, y) => y[1] - x[1])
      .map(([lvl, p]) => ({ label: a.legend[lvl] ?? `Level ${lvl}`, p, top: lvl === topLevel }));
  }
  return [
    { label: "yes", p: a.noul, top: a.noul >= 0.5 },
    { label: "no", p: 1 - a.noul, top: a.noul < 0.5 },
  ];
}

/** Build a display trace of every answer, flagging which ones code actually used. */
function buildTraces(
  r: SystemOneResponse,
  used: Set<string>,
  questions: Record<string, Question>,
): AnswerTrace[] {
  return Object.entries(r.answers).map(([id, a]) => {
    const question = QUESTION_LABELS[id] ?? questionText(questions[id]).replace(/`/g, "");
    const distribution = distributionOf(a);
    let value: string;
    let confidence: number;
    if (a.type === "choice") {
      value = a.choice;
      confidence = a.confidence;
    } else if (a.type === "score") {
      value = a.legend[String(Math.round(a.score))] ?? a.score.toFixed(2);
      confidence = a.confidence;
    } else {
      value = a.noul >= 0.5 ? "yes" : "no";
      confidence = 2 * Math.abs(a.noul - 0.5);
    }
    return { id, question, kind: a.type, value, confidence, used: used.has(id), distribution };
  });
}

const VOLUME_LEVELS = [0, 20, 40, 65, 90];

function audioTargets(zones: SonosZone[], zoneChoice: string): SonosZone[] {
  if (zoneChoice === "whole_house" || zoneChoice === "none") return zones;
  const one = zones.find((z) => z.id === zoneChoice);
  return one ? [one] : zones;
}

function oneAudioAction(zone: SonosZone, action: string, r: SystemOneResponse): AudioAction {
  const base = { zone: zone.id, zoneName: zone.name };
  switch (action) {
    case "play":
    case "resume":
    case "play_favorite":
      return { ...base, kind: action, summary: `${zone.name} playing`, chips: ["playing"] };
    case "pause":
      return { ...base, kind: "pause", summary: `${zone.name} paused`, chips: ["paused"] };
    case "stop":
      return { ...base, kind: "stop", summary: `${zone.name} stopped`, chips: ["stopped"] };
    case "next":
      return { ...base, kind: "next", summary: `${zone.name} skipped ahead`, chips: ["next track"] };
    case "previous":
      return { ...base, kind: "previous", summary: `${zone.name} went back`, chips: ["previous track"] };
    case "volume_up":
      return { ...base, kind: "volume_up", summary: `${zone.name} louder`, chips: ["vol +10"] };
    case "volume_down":
      return { ...base, kind: "volume_down", summary: `${zone.name} quieter`, chips: ["vol \u221210"] };
    case "set_volume": {
      const v = VOLUME_LEVELS[Math.max(0, Math.min(4, Math.round(score(r, "volume_level").score)))];
      return { ...base, kind: "set_volume", summary: `${zone.name} volume ${v}`, chips: [`vol ${v}`] };
    }
    default:
      return { ...base, kind: action, summary: `${zone.name} ${action}`, chips: [] };
  }
}

/** Resolve an audio command into concrete Sonos actions. Marks used questions. */
function resolveAudio(zones: SonosZone[], r: SystemOneResponse, used: Set<string>): AudioAction[] {
  const action = choice(r, "audio_action").choice;
  const zoneChoice = choice(r, "audio_zone").choice;
  used.add("audio_action").add("audio_zone");
  if (action === "none") return [];
  if (action === "set_volume") used.add("volume_level");

  if (action === "group") {
    const members: SonosZone[] = [];
    for (const z of zones) {
      used.add(`group_${z.id}`);
      if (((r.answers[`group_${z.id}`] as NoulAnswer | undefined)?.noul ?? 0) > 0.4) members.push(z);
    }
    // Always include the primary target zone the model picked.
    if (zoneChoice !== "whole_house" && zoneChoice !== "none") {
      const primary = zones.find((z) => z.id === zoneChoice);
      if (primary && !members.some((m) => m.id === primary.id)) members.push(primary);
    }
    let group = zoneChoice === "whole_house" ? zones : members;
    if (group.length < 2) group = zones; // underspecified grouping -> whole house
    const names = group.map((m) => m.name);
    const [coord, ...rest] = group;
    return [
      {
        zone: coord.id,
        zoneName: coord.name,
        kind: "group",
        summary: `${coord.name} grouped with ${rest.map((m) => m.name).join(", ")}`,
        chips: names,
      },
    ];
  }

  if (action === "ungroup") {
    return audioTargets(zones, zoneChoice).map((z) => ({
      zone: z.id,
      zoneName: z.name,
      kind: "ungroup",
      summary: `${z.name} ungrouped`,
      chips: ["ungrouped"],
    }));
  }

  // Starting playback with a genre in mind => start an internet-radio station.
  if (action === "play" || action === "play_favorite") {
    used.add("station");
    const st = stationById(choice(r, "station").choice);
    if (st) {
      return audioTargets(zones, zoneChoice).map((z) => ({
        zone: z.id,
        zoneName: z.name,
        kind: "play_station",
        summary: `${z.name} playing ${st.name}`,
        chips: [st.name],
        uri: st.url,
      }));
    }
  }

  return audioTargets(zones, zoneChoice).map((z) => oneAudioAction(z, action, r));
}

/**
 * Interpret one already-evaluated request against the working home. Returns the
 * resolution (actions + traces) but does not mutate `home`; the caller applies
 * the patches so later sub-requests observe the updated state.
 */
export function resolveCommand(
  request: string,
  home: HomeState,
  zones: SonosZone[],
  r: SystemOneResponse,
  questions: Record<string, Question>,
): CommandResolution {
  const category = choice(r, "category").choice;
  const used = new Set<string>(["category"]);

  if (category === "audio_command") {
    const audioActions = resolveAudio(zones, r, used);
    return {
      request,
      category,
      actions: [],
      audioActions,
      answers: buildTraces(r, used, questions),
      note: audioActions.length === 0 ? "No matching speaker zone." : undefined,
    };
  }

  if (category === "scene") {
    used.add("scene");
    const sceneId = choice(r, "scene").choice;
    const actions = SCENES[sceneId]?.(home) ?? [];
    return {
      request,
      category,
      actions,
      audioActions: [],
      answers: buildTraces(r, used, questions),
      note: sceneId === "none" ? "No matching scene." : `Activated "${sceneId.replace(/_/g, " ")}".`,
    };
  }

  if (category === "query") {
    used.add("room").add("device_type");
    const room = choice(r, "room").choice;
    const deviceType = choice(r, "device_type").choice;
    const matches = targetDevices(home, "room", room, deviceType);
    const on = matches.filter((d) => (d.type === "lock" ? d.locked : d.on));
    const note =
      matches.length === 0
        ? "No matching devices found."
        : `${on.length} of ${matches.length} matching device(s) are ${describeStateWord(deviceType)}.`;
    return { request, category, actions: [], audioActions: [], answers: buildTraces(r, used, questions), note };
  }

  if (category === "conversation") {
    return { request, category, actions: [], audioActions: [], answers: buildTraces(r, used, questions) };
  }

  // device_command
  used.add("scope").add("room").add("device_type").add("action");
  const scope = choice(r, "scope").choice;
  const room = choice(r, "room").choice;
  const deviceType = choice(r, "device_type").choice;
  const action = choice(r, "action").choice;

  if (action === "set_level" && deviceType === "light") used.add("brightness_level");
  if (deviceType === "thermostat") used.add("temperature_direction");

  const targets = targetDevices(home, scope, room, deviceType);
  const roomLabel = (id: string) => home.rooms.find((rm) => rm.id === id)?.name ?? ROOM_NAME[id] ?? id;
  const actions: DeviceAction[] = [];
  for (const device of targets) {
    const patch = applyAction(device, action, r);
    if (patch && Object.keys(patch).length > 0) {
      actions.push(act(device, patch, describePatch(device, patch), roomLabel(device.room)));
    }
  }

  return {
    request,
    category,
    actions,
    audioActions: [],
    answers: buildTraces(r, used, questions),
    note: actions.length === 0 ? "No devices matched that command." : undefined,
  };
}

function describeStateWord(deviceType: string): string {
  if (deviceType === "lock") return "locked";
  if (deviceType === "blinds") return "open";
  return "on";
}

/** Apply a resolution's patches to a home, returning a new HomeState. */
export function applyActions(home: HomeState, actions: DeviceAction[]): HomeState {
  if (actions.length === 0) return home;
  const byId = new Map(actions.map((a) => [a.deviceId, a.patch]));
  return {
    ...home,
    devices: home.devices.map((d) => (byId.has(d.id) ? { ...d, ...byId.get(d.id) } : d)),
  };
}

export function categoryOf(r: SystemOneResponse): string {
  return choice(r, "category").choice;
}

export function isCompound(r: SystemOneResponse): boolean {
  return noul(r, "is_compound").noul > 0.6;
}
