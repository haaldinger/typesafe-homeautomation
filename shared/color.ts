// Color helpers shared by the server (Hue xy conversion, voice color names) and the UI.

export type NamedLightColor = { label: string; hex: string } | { label: string; kelvin: number };

/** Colors the assistant can set by name. Keys double as TypeSafe choice ids. */
export const LIGHT_COLORS: Record<string, NamedLightColor> = {
  red: { label: "red", hex: "#ff2a1a" },
  orange: { label: "orange", hex: "#ff7a00" },
  yellow: { label: "yellow", hex: "#ffd000" },
  green: { label: "green", hex: "#1fd65f" },
  blue: { label: "blue", hex: "#1e5bff" },
  purple: { label: "purple", hex: "#8f3dff" },
  pink: { label: "pink", hex: "#ff4fa3" },
  warm_white: { label: "warm white", kelvin: 2400 },
  neutral_white: { label: "neutral white", kelvin: 4000 },
  daylight: { label: "daylight", kelvin: 6000 },
};

export const MIN_KELVIN = 2000;
export const MAX_KELVIN = 6500;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** sRGB hex -> CIE xy as used by Hue (Philips' published conversion; the bridge clamps to gamut). */
export function hexToXy(hex: string): [number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  };
  const [r, g, b] = hexToRgb(hex).map(lin);
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
  const sum = X + Y + Z;
  if (sum === 0) return [0.3227, 0.329];
  return [Number((X / sum).toFixed(4)), Number((Y / sum).toFixed(4))];
}

/** CIE xy -> a full-brightness sRGB hex for display. */
export function xyToHex(x: number, y: number): string {
  if (y <= 0) return "#ffffff";
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  const max = Math.max(r, g, b, 1);
  [r, g, b] = [r / max, g / max, b / max].map((c) => {
    const v = Math.max(0, c);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  });
  return rgbToHex(r * 255, g * 255, b * 255);
}

/** Approximate display color for a white temperature (Tanner Helland's fit). */
export function kelvinToHex(kelvin: number): string {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return rgbToHex(r, g, b);
}

/** Closest named color for a patch, for human-readable summaries. */
export function colorName(patch: { color?: string; kelvin?: number }): string {
  if (patch.kelvin !== undefined) {
    let best = "white";
    let bestD = Infinity;
    for (const c of Object.values(LIGHT_COLORS)) {
      if ("kelvin" in c && Math.abs(c.kelvin - patch.kelvin) < bestD) {
        bestD = Math.abs(c.kelvin - patch.kelvin);
        best = c.label;
      }
    }
    return best;
  }
  if (patch.color) {
    const [r, g, b] = hexToRgb(patch.color);
    let best = patch.color;
    let bestD = Infinity;
    for (const c of Object.values(LIGHT_COLORS)) {
      if (!("hex" in c)) continue;
      const [cr, cg, cb] = hexToRgb(c.hex);
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c.label;
      }
    }
    return best;
  }
  return "";
}
