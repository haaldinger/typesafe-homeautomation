// Shared types used by both the server and the web client.

export type DeviceType =
  | "light"
  | "thermostat"
  | "lock"
  | "blinds"
  | "fan"
  | "media";

// A room identifier. The simulator uses fixed slugs; Home Assistant areas are
// slugified at runtime, so this is a plain string.
export type RoomId = string;

export interface Device {
  id: string;
  name: string;
  room: RoomId;
  type: DeviceType;
  /** Power / open / locked state. Meaning depends on type. */
  on: boolean;
  /** 0-100 for lights (brightness) and blinds (open %). */
  level?: number;
  /** Target temperature in °F for thermostats. */
  temperature?: number;
  /** 0-100 for fans (speed) and media (volume). */
  intensity?: number;
  /** Locks: true when locked. Mirrors `on` for clarity in the UI. */
  locked?: boolean;
  /** Lights: current color as #rrggbb (meaningful when colorMode is "color"). */
  color?: string;
  /** Lights: white color temperature in Kelvin (meaningful when colorMode is "white"). */
  kelvin?: number;
  colorMode?: "color" | "white";
  effect?: "colorloop" | "none";
  supportsColor?: boolean;
  supportsWhite?: boolean;
  /** False when the backend can't reach the device (e.g. a Hue bulb switched off at the wall). */
  available?: boolean;
}

export interface Room {
  id: RoomId;
  name: string;
}

/** A lighting scene saved on the device backend (e.g. a Hue scene). */
export interface LightScene {
  /** Used as the DeviceAction deviceId to activate it. */
  id: string;
  name: string;
  room?: RoomId;
}

export interface HomeState {
  rooms: Room[];
  devices: Device[];
  scenes?: LightScene[];
}

export type DevicePatch = Partial<
  Pick<Device, "on" | "level" | "temperature" | "intensity" | "locked" | "color" | "kelvin" | "colorMode" | "effect">
> & {
  /** One-off: briefly flash the light. Not stored as device state. */
  alert?: boolean;
  /** Fade duration for this change. Not stored as device state. */
  transitionMs?: number;
};

export type PatternKind = "blink" | "alternate" | "pulse" | "fireplace" | "police";

/** A repeating light animation for one room ("all" for every room). */
export interface PatternSpec {
  kind: PatternKind;
  /** #rrggbb colors to use; some kinds ignore them. */
  colors: string[];
  intervalMs: number;
}

export interface RunningPattern extends PatternSpec {
  room: RoomId | "all";
  label: string;
}

/** A pattern the assistant decided to start or stop. */
export interface PatternAction {
  op: "start" | "stop";
  room: RoomId | "all";
  roomName: string;
  summary: string;
  spec?: PatternSpec;
}

/** A single concrete mutation the assistant decided to make. */
export interface DeviceAction {
  deviceId: string;
  deviceName: string;
  room: RoomId;
  summary: string;
  patch: DevicePatch;
}

/** A Sonos zone (one amp / room of audio). */
export interface SonosZone {
  id: string;
  name: string;
  playback: "playing" | "paused" | "stopped";
  track: { title: string; artist: string; album?: string } | null;
  /** Active non-music source, such as TV audio over HDMI ARC. */
  source?: string;
  /** True after Aura has observed a TV/HDMI ARC source for this zone. */
  hasTvSource?: boolean;
  /** 0-100 */
  volume: number;
  /** Names of the other zones grouped with this one. */
  groupedWith: string[];
  /** Album-art URL when known (live Sonos); absent uses a generated cover. */
  art?: string;
  /** Playback position + length in seconds, for the progress bar. */
  elapsed?: number;
  duration?: number;
  /** False when the speaker didn't answer; other fields are stale defaults, not live state. */
  reachable?: boolean;
}

/** Normalized aircraft data used by the wall-panel radar. */
export interface NearbyAircraft {
  id: string;
  callsign: string;
  flightNumber?: string;
  operator?: string;
  type?: string;
  latitude: number;
  longitude: number;
  altitudeFeet?: number;
  speedKnots?: number;
  heading?: number;
  origin?: string;
  destination?: string;
  distanceNm?: number;
  bearingDeg?: number;
  lastSeen: string;
}

export interface FlightResponse {
  airport: string;
  airportName: string;
  updatedAt: string;
  stale: boolean;
  source: "demo" | "home_assistant" | "opensky" | "unavailable";
  aircraft: NearbyAircraft[];
}

/** One track in a zone's play queue. */
export interface QueueTrack {
  /** 1-based position in the queue. */
  position: number;
  title: string;
  artist: string;
  album?: string;
  art?: string;
  /** UPnP object id (e.g. "Q:0/3"), used to remove the track. */
  objectId?: string;
  /** True when this is the currently-playing track. */
  current?: boolean;
}

/** A saved Sonos favorite (station, playlist, album, etc.). */
export interface Favorite {
  id: string;
  title: string;
  description?: string;
  art?: string;
}

/** A Spotify search result track. */
export interface SpotifyResult {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  art?: string;
  durationMs: number;
  /** Why it was suggested, e.g. "Similar to Beastie Boys". */
  reason?: string;
}

/** A zone's sound / EQ settings. */
export interface EqState {
  /** -10..10 */
  bass: number;
  /** -10..10 */
  treble: number;
  night: boolean;
  loudness: boolean;
}

/** An internet radio station from the Radio Browser directory. */
export interface RadioStation {
  id: string;
  name: string;
  url: string;
  favicon?: string;
  country?: string;
  bitrate?: number;
  codec?: string;
}

/** A single audio action the assistant decided to take on a zone. */
export interface AudioAction {
  zone: string;
  zoneName: string;
  kind: string;
  summary: string;
  chips: string[];
  /** Stream URI for a play_station action. */
  uri?: string;
  /** Station/track name for display. */
  name?: string;
}

/** One entry in an answer's probability distribution. */
export interface DistributionEntry {
  label: string;
  p: number;
  /** True for the winning option/level. */
  top: boolean;
}

/** One TypeSafe question's answer, normalized for display in the UI. */
export interface AnswerTrace {
  id: string;
  /** The natural-language question the model answered. */
  question: string;
  kind: "choice" | "score" | "noul";
  /** Human-readable resolved value, e.g. "kitchen" or "yes". */
  value: string;
  /** 0-1 certainty used for the color-coded pill. */
  confidence: number;
  used: boolean;
  distribution: DistributionEntry[];
}

/** One answer the user can pick when the assistant asks a follow-up. */
export interface ClarifyOption {
  label: string;
  /** TypeSafe answers to force (question id -> choice) when re-running the request. */
  overrides: Record<string, string>;
}

/** Asked instead of acting when a deciding answer was too uncertain. */
export interface Clarification {
  question: string;
  /** The TypeSafe question that was uncertain. */
  questionId: string;
  options: ClarifyOption[];
}

/** Result of interpreting one atomic sub-request. */
export interface CommandResolution {
  request: string;
  category: string;
  actions: DeviceAction[];
  audioActions: AudioAction[];
  patternActions?: PatternAction[];
  answers: AnswerTrace[];
  note?: string;
  clarify?: Clarification;
}

export interface CommandResponse {
  reply: string;
  /** The original request text, echoed for the decision-trace header. */
  request: string;
  category: string;
  isCompound: boolean;
  usedLlm: boolean;
  resolutions: CommandResolution[];
  actions: DeviceAction[];
  audioActions: AudioAction[];
  /** Total TypeSafe token usage across every call made for this request. */
  usage: { inputTokens: number; outputTokens: number; calls: number };
  latencyMs: number;
  /** Present when the assistant needs the client to apply state changes. */
  home?: HomeState;
  /** Current Sonos zones after any audio actions. */
  zones?: SonosZone[];
  patternActions?: PatternAction[];
  /** Patterns running after this command. */
  patterns?: RunningPattern[];
  /** Present when the assistant needs the user to pick before acting. */
  clarify?: Clarification;
}
