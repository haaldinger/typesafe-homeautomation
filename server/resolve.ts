import type {
  AnswerTrace,
  AudioAction,
  Clarification,
  ClarifyOption,
  CommandResolution,
  Device,
  DeviceAction,
  DevicePatch,
  DistributionEntry,
  HomeState,
  PatternAction,
  PatternKind,
  SonosZone,
} from "../shared/types.ts";
import { ROOM_NAME } from "../shared/home.ts";
import { colorName, LIGHT_COLORS } from "../shared/color.ts";
import { stationById } from "./stations.ts";
import type {
  Answer,
  ChoiceAnswer,
  NoulAnswer,
  Question,
  ScoreAnswer,
  SystemOneResponse,
} from "./typesafe.ts";
import { PATTERN_SPEEDS_MS, QUESTION_LABELS, sceneKey } from "./typesafe.ts";

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

/** The color/white patch the model asked for, limited to what the light supports. */
function colorPatch(device: Device, r: SystemOneResponse, needColor = false): DevicePatch | null {
  const answer = r.answers.light_color as ChoiceAnswer | undefined;
  let pick = answer?.choice;
  // "Set the lights to something relaxing": the model hedged on "none", but a color change needs one.
  if (needColor && answer && pick === "none") {
    const best = Object.entries(answer.probabilities)
      .filter(([k]) => k !== "none")
      .sort((x, y) => y[1] - x[1])[0];
    if (best && best[1] >= RUNNER_UP) pick = best[0];
  }
  const c = pick ? LIGHT_COLORS[pick] : undefined;
  if (!c) return null;
  if ("hex" in c) return device.supportsColor === false ? null : { on: true, color: c.hex, colorMode: "color", effect: "none" };
  return device.supportsWhite === false ? null : { on: true, kelvin: c.kelvin, colorMode: "white", effect: "none" };
}

function lightPatch(device: Device, action: string, r: SystemOneResponse): DevicePatch | null {
  switch (action) {
    case "turn_on":
      return { on: true };
    case "turn_off":
      return { on: false };
    case "toggle":
      return { on: !device.on };
    case "set_level": {
      const level = brightnessFromScore(score(r, "brightness_level").score);
      return { on: level > 0, level };
    }
    case "increase":
      return { on: true, level: Math.min(100, (device.level ?? 0) + 20) };
    case "decrease": {
      const level = Math.max(0, (device.level ?? 0) - 20);
      return { on: level > 0, level };
    }
    case "set_color":
      return colorPatch(device, r, true);
    case "party_mode":
      return device.supportsColor === false ? null : { on: true, effect: "colorloop" };
    case "stop_effect":
      // The bridge rejects effect changes on lights that are off.
      return device.on ? { effect: "none" } : null;
    case "flash":
      return { alert: true };
    default:
      return null;
  }
}

function applyAction(
  device: Device,
  action: string,
  r: SystemOneResponse,
): DevicePatch | null {
  switch (device.type) {
    case "light": {
      const patch = lightPatch(device, action, r);
      // "Turn the lights on blue", "brighten it and make it warm" carry a color too.
      if (action !== "turn_off" && action !== "set_color" && (patch?.on || action === "none")) {
        const color = colorPatch(device, r);
        if (color) return { ...patch, ...color };
      }
      return patch;
    }

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

function act(device: Device, patch: DevicePatch, verb: string, roomName?: string): DeviceAction {
  const label = roomName ?? ROOM_NAME[device.room] ?? device.room;
  return {
    deviceId: device.id,
    deviceName: device.name,
    room: device.room,
    summary: `${device.name} (${label}) ${verb}`,
    patch,
  };
}

function describePatch(device: Device, patch: DevicePatch): string {
  if (patch.alert) return "flashed";
  if (patch.effect === "colorloop") return "party mode on";
  if (patch.color || patch.kelvin !== undefined) {
    return `set to ${colorName(patch)}${patch.level !== undefined ? ` at ${patch.level}%` : ""}`;
  }
  if (patch.effect === "none") return "party mode off";
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
    case "play_similar":
      return { ...base, kind: "play_similar", summary: `${zone.name} queueing more like this`, chips: ["more like this"] };
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
  allowClarify = true,
): CommandResolution {
  const category = choice(r, "category").choice;
  const used = new Set<string>(["category"]);
  const ask = (
    id: string,
    question: string,
    label: (choiceId: string) => ClarifyOption | null,
    ignore: string[] = [],
  ): CommandResolution | null => {
    if (!allowClarify) return null;
    const options = uncertainOptions(r, id, label, ignore);
    if (!options) return null;
    used.add(id);
    const words = options.map((o) => o.label);
    const clarify: Clarification = {
      question: `${question} — ${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}?`,
      questionId: id,
      options,
    };
    return { request, category, actions: [], audioActions: [], answers: buildTraces(r, used, questions), note: clarify.question, clarify };
  };

  if (category === "audio_command") {
    if (zones.length > 1 && choice(r, "audio_action").choice !== "none") {
      const q = ask("audio_zone", "Which speaker", (id) => {
        if (id === "whole_house") return { label: "everywhere", overrides: { audio_zone: id } };
        const z = zones.find((zz) => zz.id === id);
        return z ? { label: z.name, overrides: { audio_zone: id } } : null;
      });
      if (q) return q;
    }
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

  const roomLabel = (id: string) => home.rooms.find((rm) => rm.id === id)?.name ?? ROOM_NAME[id] ?? id;

  // Saved lighting scenes ("set the living room to Relax") can come through as a
  // scene or as a device command.
  if (category === "scene" || category === "device_command") {
    const sceneNames = new Map((home.scenes ?? []).map((s) => [sceneKey(s.name), s.name]));
    const q = ask("light_scene", "Which scene", (id) => {
      const name = sceneNames.get(id);
      return name ? { label: name, overrides: { light_scene: id } } : null;
    });
    if (q) return q;
    const sceneAction = resolveLightScene(home, r, used, roomLabel);
    if (sceneAction) {
      return {
        request,
        category,
        actions: [sceneAction],
        audioActions: [],
        answers: buildTraces(r, used, questions),
        note: `Activated "${sceneAction.deviceName}".`,
      };
    }
  }

  if (category === "scene") {
    used.add("scene");
    const sceneId = choice(r, "scene").choice;
    const actions = SCENES[sceneId]?.(home) ?? [];
    if (actions.length > 0) {
      return {
        request,
        category,
        actions,
        audioActions: [],
        answers: buildTraces(r, used, questions),
        note: `Activated "${sceneId.replace(/_/g, " ")}".`,
      };
    }
    // Not a known scene (e.g. "party mode"): try it as a device command below.
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
  if (deviceType === "light" || action === "set_color") used.add("light_color");

  // "The lamp": one named device. Ask if it could be several; ignore when clearly room- or house-wide.
  let onlyDevice: Device | undefined;
  const deviceAnswer = r.answers.device as ChoiceAnswer | undefined;
  if (deviceAnswer && action !== "none" && (deviceAnswer.probabilities.none ?? 0) < ASK_BELOW) {
    used.add("device");
    const q = ask("device", "Which one", (id) => {
      if (id === "none") return { label: "all of them", overrides: { device: "none" } };
      const d = home.devices.find((x) => x.id === id);
      return d ? { label: `${d.name} (${roomLabel(d.room)})`, overrides: { device: id } } : null;
    });
    if (q) return q;
    if (deviceAnswer.choice !== "none") onlyDevice = home.devices.find((d) => d.id === deviceAnswer.choice);
  }

  // Unsure where or what color? Ask rather than change the wrong thing.
  if (!onlyDevice && action !== "none" && scope !== "whole_house") {
    const q = ask("room", "Which room", (id): ClarifyOption | null =>
      id === "none"
        ? { label: "everywhere", overrides: { room: "none", scope: "whole_house" } }
        : home.rooms.some((rm) => rm.id === id)
          ? { label: roomLabel(id), overrides: { room: id } }
          : null,
    );
    if (q) return q;
  }
  if (action === "set_color") {
    // Changing color with "no color" isn't an option, so weigh only the real colors.
    const q = ask(
      "light_color",
      "Which color",
      (id) => (LIGHT_COLORS[id] ? { label: LIGHT_COLORS[id].label, overrides: { light_color: id } } : null),
      ["none"],
    );
    if (q) return q;
  }

  // Patterns run per room, so "blink the lamp" animates the lamp's room.
  const pattern = resolvePattern(r, action, onlyDevice?.room ?? room, roomLabel, used);
  if (pattern) {
    return {
      request,
      category,
      actions: [],
      audioActions: [],
      patternActions: [pattern],
      answers: buildTraces(r, used, questions),
    };
  }

  // Color and effect requests only make sense for lights, even if the device type was missed.
  const lightOnly = ["set_color", "party_mode", "stop_effect", "flash"].includes(action);
  const targets = onlyDevice ? [onlyDevice] : targetDevices(home, scope, room, lightOnly ? "light" : deviceType);
  const actions: DeviceAction[] = [];
  for (const device of targets) {
    const patch = applyAction(device, action, r);
    if (patch && Object.keys(patch).length > 0) {
      actions.push(act(device, patch, describePatch(device, patch), roomLabel(device.room)));
    }
  }

  // "Stop the lights" also ends any running pattern (which restores the lights).
  const patternActions: PatternAction[] =
    action === "stop_effect"
      ? [{ op: "stop", room: room === "none" ? "all" : room, roomName: room === "none" ? "the house" : roomLabel(room), summary: "patterns stopped" }]
      : [];

  return {
    request,
    category,
    actions,
    audioActions: [],
    patternActions,
    answers: buildTraces(r, used, questions),
    note: actions.length === 0 && patternActions.length === 0 ? "No devices matched that command." : undefined,
  };
}

function resolvePattern(
  r: SystemOneResponse,
  action: string,
  room: string,
  roomLabel: (id: string) => string,
  used: Set<string>,
): PatternAction | null {
  const styleAnswer = r.answers.pattern_style as ChoiceAnswer | undefined;
  if (!styleAnswer) return null;
  const style = styleAnswer.choice;

  const colors: string[] = [];
  for (const [id, c] of Object.entries(LIGHT_COLORS)) {
    const a = r.answers[`pattern_color_${id}`] as NoulAnswer | undefined;
    if ("hex" in c && a && a.noul > 0.5) colors.push(c.hex);
  }
  const single = LIGHT_COLORS[(r.answers.light_color as ChoiceAnswer | undefined)?.choice ?? ""];
  if (!colors.length && single && "hex" in single) colors.push(single.hex);

  // A one-off "flash the lights" stays a single flash unless colors make it a pattern.
  const wantsPattern =
    action === "light_pattern" ||
    (style !== "none" && !["stop_effect", "turn_off"].includes(action) && (action !== "flash" || colors.length > 0));
  if (!wantsPattern) return null;

  used.add("pattern_style").add("pattern_speed");
  for (const id of Object.keys(LIGHT_COLORS)) if (`pattern_color_${id}` in r.answers) used.add(`pattern_color_${id}`);

  const kind: PatternKind = style === "none" ? "blink" : (style as PatternKind);
  const speed = score(r, "pattern_speed").score;
  const intervalMs = PATTERN_SPEEDS_MS[Math.max(0, Math.min(PATTERN_SPEEDS_MS.length - 1, Math.round(speed)))];
  const target = room === "none" ? "all" : room;
  const where = target === "all" ? "the house" : roomLabel(target);
  const colorWords = colors.map((c) => colorName({ color: c })).join(" & ");
  const what = {
    blink: `blinking${colorWords ? ` ${colorWords}` : ""}`,
    alternate: `alternating ${colorWords || "colors"}`,
    pulse: `pulsing${colorWords ? ` ${colorWords}` : ""}`,
    fireplace: "flickering like a fireplace",
    police: "flashing police lights",
  }[kind];
  return {
    op: "start",
    room: target,
    roomName: where,
    summary: `${where} ${what}`,
    spec: { kind, colors, intervalMs },
  };
}

function describeStateWord(deviceType: string): string {
  if (deviceType === "lock") return "locked";
  if (deviceType === "blinds") return "open";
  return "on";
}

function resolveLightScene(
  home: HomeState,
  r: SystemOneResponse,
  used: Set<string>,
  roomLabel: (id: string) => string,
): DeviceAction | null {
  const answer = r.answers.light_scene as ChoiceAnswer | undefined;
  if (!answer || answer.choice === "none") return null;
  used.add("light_scene").add("room");
  const room = choice(r, "room").choice;
  const matches = (home.scenes ?? []).filter((s) => sceneKey(s.name) === answer.choice);
  const scene = matches.find((s) => s.room === room) ?? matches[0];
  if (!scene) return null;
  return {
    deviceId: scene.id,
    deviceName: scene.name,
    room: scene.room ?? "",
    summary: scene.room ? `${roomLabel(scene.room)} set to "${scene.name}"` : `"${scene.name}" scene on`,
    patch: {},
  };
}

/** Apply a resolution's patches to a home, returning a new HomeState. */
export function applyActions(home: HomeState, actions: DeviceAction[]): HomeState {
  if (actions.length === 0) return home;
  // `alert` is a one-off blink, not state to keep.
  const byId = new Map(actions.map(({ deviceId, patch: { alert, transitionMs, ...state } }) => [deviceId, state]));
  return {
    ...home,
    devices: home.devices.map((d) => (byId.has(d.id) ? { ...d, ...byId.get(d.id) } : d)),
  };
}

/** Ask when the top answer is below this probability... */
const ASK_BELOW = 0.6;
/** ...and a real alternative is at least this likely. */
const RUNNER_UP = 0.2;

/** Options to offer when a choice answer is genuinely split, else null. */
function uncertainOptions(
  r: SystemOneResponse,
  id: string,
  label: (choiceId: string) => ClarifyOption | null,
  ignore: string[] = [],
): ClarifyOption[] | null {
  const a = r.answers[id];
  if (!a || a.type !== "choice") return null;
  const kept = Object.entries(a.probabilities).filter(([k]) => !ignore.includes(k));
  const total = kept.reduce((s, [, p]) => s + p, 0) || 1;
  const ranked = kept.map(([k, p]): [string, number] => [k, p / total]).sort((x, y) => y[1] - x[1]);
  if (!ranked.length || ranked[0][1] >= ASK_BELOW) return null;
  const options = ranked
    .filter(([, p], i) => i === 0 || p >= RUNNER_UP)
    .slice(0, 3)
    .map(([choiceId]) => label(choiceId))
    .filter((o): o is ClarifyOption => o !== null);
  return options.length >= 2 ? options : null;
}

/** Force answers the user picked in a follow-up, so the request resolves their way. */
export function applyOverrides(r: SystemOneResponse, overrides: Record<string, string>): void {
  for (const [id, value] of Object.entries(overrides)) {
    const a = r.answers[id];
    if (!a || a.type !== "choice") continue;
    const probabilities = Object.fromEntries(Object.keys(a.probabilities).map((k) => [k, k === value ? 1 : 0]));
    r.answers[id] = { ...a, choice: value, confidence: 1, probabilities: { ...probabilities, [value]: 1 } };
  }
}

/** A bare "stop" while a light pattern is running is a light command, not chit-chat. */
export function treatStopAsLightCommand(r: SystemOneResponse, patternsRunning: boolean): void {
  if (!patternsRunning || categoryOf(r) !== "conversation") return;
  if ((r.answers.action as ChoiceAnswer | undefined)?.choice !== "stop_effect") return;
  r.answers.category = { ...choice(r, "category"), choice: "device_command" };
}

export function categoryOf(r: SystemOneResponse): string {
  return choice(r, "category").choice;
}

export function isCompound(r: SystemOneResponse): boolean {
  return noul(r, "is_compound").noul > 0.6;
}
