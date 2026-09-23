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
}

export interface Room {
  id: RoomId;
  name: string;
}

export interface HomeState {
  rooms: Room[];
  devices: Device[];
}

/** A single concrete mutation the assistant decided to make. */
export interface DeviceAction {
  deviceId: string;
  deviceName: string;
  room: RoomId;
  summary: string;
  patch: Partial<Pick<Device, "on" | "level" | "temperature" | "intensity" | "locked">>;
}

/** A Sonos zone (one amp / room of audio). */
export interface SonosZone {
  id: string;
  name: string;
  playback: "playing" | "paused" | "stopped";
  track: { title: string; artist: string; album?: string } | null;
  /** 0-100 */
  volume: number;
  /** Names of the other zones grouped with this one. */
  groupedWith: string[];
  /** Album-art URL when known (live Sonos); absent uses a generated cover. */
  art?: string;
  /** Playback position + length in seconds, for the progress bar. */
  elapsed?: number;
  duration?: number;
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

/** Result of interpreting one atomic sub-request. */
export interface CommandResolution {
  request: string;
  category: string;
  actions: DeviceAction[];
  audioActions: AudioAction[];
  answers: AnswerTrace[];
  note?: string;
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
}
