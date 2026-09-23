import type { HomeState, SonosZone } from "../shared/types.ts";

// ---- TypeSafe question/answer wire types -------------------------------------

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true?: string; false?: string };
}
export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
}
export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  noul: number;
}
export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}
export interface ScoreAnswer {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

const URL = process.env.TYPESAFE_URL ?? "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.TYPESAFE_MODEL ?? "jev-latest";

/** Call the TypeSafe System One evaluation endpoint. Key stays server-side. */
export async function systemOne(
  state: unknown,
  questions: Record<string, Question>,
): Promise<SystemOneResponse> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    throw new Error("TYPESAFE_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ state, model: MODEL, questions }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TypeSafe ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as SystemOneResponse;
}

// ---- The speculative fan-out question set ------------------------------------

/**
 * Friendly, human-readable labels for the decision-trace UI, keyed by question
 * id. These are display-only; the model still sees the precise `instructions`
 * with their backticked state references.
 */
export const QUESTION_LABELS: Record<string, string> = {
  category: "What kind of request is this?",
  scope: "How broadly should this apply?",
  room: "Which room are they talking about?",
  device_type: "What kind of device is this about?",
  action: "What should happen to the device?",
  brightness_level: "How bright should the lights be?",
  temperature_direction: "Which way should the temperature go?",
  scene: "Is this a scene or routine?",
  audio_action: "What should happen to the music?",
  audio_zone: "Which speaker zone is this for?",
  station: "What kind of music or station?",
  group_with: "Which zone should it be grouped with?",
  volume_level: "How loud should it be?",
  is_compound: "Does this ask for more than one thing?",
};

/**
 * Every question the assistant might need, asked in a single call. Most answers
 * are irrelevant for any given request; code decides which ones to use. Room
 * options are built from the live home so they match Home Assistant areas.
 */
export function buildQuestions(home: HomeState, zones: SonosZone[] = []): Record<string, Question> {
  const roomCriteria: Record<string, string | null> = {};
  for (const r of home.rooms) roomCriteria[r.id] = r.name;
  roomCriteria.none = "No specific room mentioned.";

  const zoneCriteria: Record<string, string | null> = {};
  for (const z of zones) zoneCriteria[z.id] = z.name;
  zoneCriteria.whole_house = "Every speaker zone / the whole house.";
  zoneCriteria.none = "No specific zone mentioned.";

  const questions: Record<string, Question> = {
  category: {
    type: "choice",
    instructions: "What kind of smart-home request is `request`?",
    criteria: {
      device_command: "A command to change the state of one or more devices (lights, locks, blinds, fan, thermostat).",
      audio_command: "A command about music, speakers, or audio zones: play, pause, skip, change volume, or group/link/pair/sync speakers so the same music plays across multiple rooms or zones (e.g. 'link the deck and living room', 'pair the kitchen with the deck', 'play the same thing everywhere').",
      query: "A question about the current state of the home (e.g. 'are any lights on?').",
      scene: "A request to activate a named scene or routine like movie night, good morning, good night, or leaving home.",
      conversation: "General chit-chat, a question unrelated to controlling the home, or a request the home cannot fulfill.",
    },
  },
  scope: {
    type: "choice",
    instructions: "What is the scope of `request`? Which devices should it affect?",
    criteria: {
      whole_house: "The whole house / every applicable device.",
      room: "A single specific room.",
      device: "One specific device or a specific kind of device.",
      unspecified: "No clear scope is given.",
    },
  },
  room: {
    type: "choice",
    instructions: "Which room does `request` target? Choose 'none' if no specific room is mentioned.",
    criteria: roomCriteria,
  },
  device_type: {
    type: "choice",
    instructions: "What type of device does `request` target? Choose 'none' if unclear or not device-specific.",
    criteria: {
      light: "Lights, lamps, brightness.",
      thermostat: "Thermostat, temperature, heating, cooling.",
      lock: "Door locks, garage door.",
      blinds: "Blinds, shades, curtains.",
      fan: "Fans.",
      media: "TV, speakers, music, volume.",
      none: "No specific device type, or applies to all types.",
    },
  },
  action: {
    type: "choice",
    instructions: "What action does `request` ask to perform on the target device(s)?",
    criteria: {
      turn_on: "Turn on / activate / enable.",
      turn_off: "Turn off / deactivate / disable.",
      toggle: "Flip the current state without saying which way.",
      set_level: "Set brightness, temperature, volume, or open amount to a specific level.",
      increase: "Make it more: brighter, warmer, louder, higher, open more.",
      decrease: "Make it less: dimmer, cooler, quieter, lower, close more.",
      lock: "Lock or secure.",
      unlock: "Unlock.",
      open: "Open (blinds, garage).",
      close: "Close (blinds, garage).",
      none: "No clear action.",
    },
  },
  brightness_level: {
    type: "score",
    instructions: "If `request` sets a light brightness, how bright? Ignore if not about brightness.",
    criteria: ["Off / darkest", "Dim, cozy", "Medium", "Bright", "Maximum brightness"],
  },
  temperature_direction: {
    type: "score",
    instructions: "If `request` adjusts temperature, in which direction and how much?",
    criteria: [
      "Much cooler / cold",
      "A little cooler",
      "Keep about the same",
      "A little warmer",
      "Much warmer / hot",
    ],
  },
  scene: {
    type: "choice",
    instructions: "If `request` is a scene or routine, which one? Choose 'none' if it is not a scene.",
    criteria: {
      movie_night: "Dim lights, close blinds, turn on the TV.",
      good_morning: "Open blinds, turn on lights, comfortable temperature.",
      good_night: "Turn off lights and media, lock doors, cool bedroom.",
      away: "Turn everything off and lock all doors.",
      none: "Not a scene request.",
    },
  },
  audio_action: {
    type: "choice",
    instructions: "If `request` is about music or speakers, what action should be taken?",
    criteria: {
      play: "Start or resume playback / play something.",
      pause: "Pause playback.",
      stop: "Stop playback.",
      next: "Skip to the next track.",
      previous: "Go back to the previous track.",
      volume_up: "Turn the volume up / make it louder.",
      volume_down: "Turn the volume down / make it quieter.",
      set_volume: "Set the volume to a specific level.",
      group: "Group, link, pair, sync, or connect speakers together so the same music plays in multiple zones.",
      ungroup: "Ungroup, unlink, unpair, or separate speakers.",
      play_favorite: "Play a favorite, station, or playlist.",
      none: "Not an audio command.",
    },
  },
  audio_zone: {
    type: "choice",
    instructions: "Which speaker zone does `request` target? Choose 'none' if no specific zone is mentioned.",
    criteria: zoneCriteria,
  },
  station: {
    type: "choice",
    instructions: "If `request` asks to start music of a certain kind or genre, which fits best? Choose 'none' if no genre/kind is implied.",
    criteria: {
      chill: "Chill, lounge, downtempo, relaxing, background.",
      jazz: "Jazz, smooth, soulful.",
      pop: "Pop, indie pop, upbeat vocals, top hits.",
      electronic: "Electronic, dance, EDM, house, beats.",
      ambient: "Ambient, calm, spacey, focus, sleep.",
      rock: "Rock, indie rock, alternative.",
      none: "No particular genre or kind of music mentioned.",
    },
  },
  volume_level: {
    type: "score",
    instructions: "If `request` sets a music volume to a specific level, how loud? Ignore if not about setting volume.",
    criteria: ["Silent / off", "Quiet background", "Medium", "Loud", "Max / party"],
  },
  is_compound: {
    type: "noul",
    instructions: "Does `request` ask for more than one distinct action that would target different devices, rooms, or settings?",
    criteria: {
      true: "Two or more separate actions, e.g. 'turn off the lights and lock the door'.",
      false: "A single coherent action, even if it affects multiple devices of the same kind.",
    },
  },
  };

  // One membership question per zone, so grouping requests can name several
  // zones symmetrically instead of forcing a single "other" choice.
  for (const z of zones) {
    questions[`group_${z.id}`] = {
      type: "noul",
      instructions: `Does \`request\` name or refer to the ${z.name} speaker or room?`,
    };
  }

  return questions;
}

/** Compact home summary handed to the model as part of the state. */
export function homeSummary(home: HomeState) {
  return home.devices.map((dev) => ({
    room: dev.room,
    name: dev.name,
    type: dev.type,
    on: dev.on,
  }));
}
