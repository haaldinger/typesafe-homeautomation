import type { Device, DevicePatch } from "../../shared/types.ts";
import { Lightbulb, Thermometer, Lock, Unlock, Blinds, Fan, Power, Plus, Minus, Tv, PartyPopper, Zap } from "lucide-react";
import { colorName, kelvinToHex, LIGHT_COLORS, MAX_KELVIN, MIN_KELVIN } from "../../shared/color.ts";

interface DeviceCardProps {
  device: Device;
  flash?: boolean;
  onToggle: (d: Device) => void;
  onUpdate?: (d: Device, patch: DevicePatch) => void;
}

const SWATCHES = Object.entries(LIGHT_COLORS).flatMap(([id, c]) => ("hex" in c ? [{ id, label: c.label, hex: c.hex }] : []));

/** What the light actually looks like right now, for tinting the card. */
function displayColor(d: Device): string | undefined {
  if (d.colorMode === "white" && d.kelvin) return kelvinToHex(d.kelvin);
  if (d.colorMode === "color" && d.color) return d.color;
  return undefined;
}

// Renders the shared Device shape: `level` = brightness / blinds open %,
// `temperature` = thermostat setpoint (°F), `intensity` = fan speed / media volume.
export function DeviceCard({ device, flash = false, onToggle, onUpdate }: DeviceCardProps) {
  const isLight = device.type === "light";
  const isThermo = device.type === "thermostat";
  const isLock = device.type === "lock";
  const isBlinds = device.type === "blinds";
  const isFan = device.type === "fan";
  const isMedia = device.type === "media";

  const level = device.level ?? (device.on ? 100 : 0);
  const intensity = device.intensity ?? (device.on ? 60 : 0);
  const setpoint = device.temperature;

  const update = (patch: DevicePatch) => onUpdate?.(device, patch);
  const tint = isLight && device.on ? displayColor(device) : undefined;
  const partying = device.effect === "colorloop";
  const colorLabel = partying ? "party mode" : device.colorMode ? colorName(device) : "";

  return (
    <div
      className={`relative group flex flex-col justify-between p-4 rounded-2xl border transition-all duration-300 select-none ${
        flash ? "device-flashing ring-2 ring-amber-400/80" : ""
      } ${
        isLock && !device.locked
          ? "bg-neutral-900/90 border-rose-500/40 shadow-lg shadow-rose-950/20"
          : device.on
            ? isLight
              ? "bg-gradient-to-br from-neutral-900/95 via-neutral-900/90 to-amber-950/20 border-amber-500/30 shadow-lg shadow-amber-950/20"
              : "bg-neutral-900/90 border-neutral-700/60 shadow-md shadow-black/40"
            : "bg-neutral-900/50 border-neutral-800/70 hover:border-neutral-700/80 opacity-85 hover:opacity-100"
      }`}
    >
      {isLight && device.on && (
        <div
          className="absolute inset-0 -z-10 rounded-2xl bg-amber-500/5 blur-xl pointer-events-none transition-opacity"
          style={{ opacity: (level / 100) * 0.7, ...(tint ? { backgroundColor: `${tint}22` } : {}) }}
        />
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            onClick={() => onToggle(device)}
            style={tint ? { backgroundColor: tint, boxShadow: `0 4px 14px ${tint}66` } : undefined}
            className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 ${partying ? "animate-pulse" : ""} ${
              isLock
                ? device.locked
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                : device.on
                  ? isLight
                    ? "bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/30 ring-2 ring-amber-400/40"
                    : isFan
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-neutral-800/80 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {isLight && <Lightbulb className="w-5 h-5" />}
            {isThermo && <Thermometer className="w-5 h-5" />}
            {isLock && (device.locked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />)}
            {isBlinds && <Blinds className="w-5 h-5" />}
            {isMedia && <Tv className="w-5 h-5" />}
            {isFan && (
              <Fan className={`w-5 h-5 ${device.on ? (intensity > 60 ? "animate-fan-fast" : "animate-fan-slow") : ""}`} />
            )}
          </div>

          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-neutral-200 group-hover:text-white transition line-clamp-1">
              {device.name}
            </h4>
            <div className="text-xs text-neutral-400">
              {isLight && <span>{device.on ? `${level}%${colorLabel ? ` · ${colorLabel}` : ""}` : "Off"}</span>}
              {isThermo && <span>{device.on ? (setpoint !== undefined ? `Set to ${setpoint}°F` : "On") : "Off"}</span>}
              {isLock && (
                <span className={device.locked ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                  {device.locked ? "Locked" : "Unlocked"}
                </span>
              )}
              {isBlinds && <span>{device.on && level > 0 ? `${level}% open` : "Closed"}</span>}
              {isFan && <span>{device.on ? `${intensity}% speed` : "Off"}</span>}
              {isMedia && <span>{device.on ? `On · vol ${intensity}` : "Off"}</span>}
            </div>
          </div>
        </div>

        <button
          onClick={() => onToggle(device)}
          className={`relative p-2 touch:min-w-11 touch:min-h-11 flex items-center justify-center rounded-xl border transition-all shrink-0 ${
            isLock
              ? device.locked
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : "bg-rose-500/20 border-rose-500/50 text-rose-300"
              : device.on
                ? "bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30"
                : "bg-neutral-800/60 border-neutral-700/60 text-neutral-400 hover:bg-neutral-700/70 hover:text-neutral-200"
          }`}
          title={isLock ? (device.locked ? "Unlock" : "Lock") : device.on ? "Turn off" : "Turn on"}
          aria-label={`${device.name}: ${isLock ? (device.locked ? "unlock" : "lock") : device.on ? "turn off" : "turn on"}`}
        >
          {isLock ? device.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" /> : <Power className="w-4 h-4" />}
        </button>
      </div>

      {isLight && (
        <div className="mt-2 pt-2 border-t border-neutral-800/60">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
            <span>Brightness</span>
            <span className="font-mono text-neutral-300">{level}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={level}
            disabled={!device.on}
            onChange={(e) => update({ level: parseInt(e.target.value, 10), on: true })}
            className="w-full accent-amber-500 disabled:opacity-30 transition"
            aria-label={`${device.name} brightness`}
          />

          {device.on && device.supportsColor && (
            <div className="flex items-center gap-1.5 touch:gap-2 mt-3">
              {SWATCHES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => update({ color: s.hex, colorMode: "color", effect: "none", on: true })}
                  className={`w-5 h-5 touch:w-auto touch:flex-1 touch:h-9 touch:max-w-12 rounded-full border transition hover:scale-110 ${
                    device.colorMode === "color" && device.color === s.hex && !partying
                      ? "border-white ring-2 ring-white/40"
                      : "border-white/10"
                  }`}
                  style={{ backgroundColor: s.hex }}
                  title={s.label}
                  aria-label={`Set ${device.name} to ${s.label}`}
                />
              ))}
              <label
                className="relative w-5 h-5 touch:w-auto touch:flex-1 touch:h-9 touch:max-w-12 rounded-full border border-white/20 cursor-pointer overflow-hidden hover:scale-110 transition"
                style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
                title="Pick any color"
              >
                <input
                  type="color"
                  value={device.color ?? "#ffffff"}
                  onChange={(e) => update({ color: e.target.value, colorMode: "color", effect: "none", on: true })}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label={`${device.name} custom color`}
                />
              </label>
            </div>
          )}

          {device.on && device.supportsWhite && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
                <span>Warm</span>
                <span>Cool</span>
              </div>
              <input
                type="range"
                min={MIN_KELVIN}
                max={MAX_KELVIN}
                step={50}
                value={device.colorMode === "white" && device.kelvin ? device.kelvin : 2700}
                onChange={(e) => update({ kelvin: parseInt(e.target.value, 10), colorMode: "white", effect: "none", on: true })}
                className="w-full"
                style={{ accentColor: kelvinToHex(device.kelvin ?? 2700) }}
                aria-label={`${device.name} white temperature`}
              />
            </div>
          )}

          {device.on && device.supportsColor && (
            <div className="flex gap-1.5 mt-3">
              <button
                onClick={() => update({ effect: partying ? "none" : "colorloop", on: true })}
                className={`flex-1 flex items-center justify-center gap-1 py-1 touch:min-h-11 touch:text-xs text-[10px] font-semibold rounded-lg border transition ${
                  partying
                    ? "bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-300"
                    : "bg-neutral-800/60 border-neutral-700/50 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <PartyPopper className="w-3 h-3" /> {partying ? "Stop party" : "Party"}
              </button>
              <button
                onClick={() => update({ alert: true })}
                className="flex-1 flex items-center justify-center gap-1 py-1 touch:min-h-11 touch:text-xs text-[10px] font-semibold rounded-lg border bg-neutral-800/60 border-neutral-700/50 text-neutral-400 hover:text-neutral-200 transition"
              >
                <Zap className="w-3 h-3" /> Flash
              </button>
            </div>
          )}
        </div>
      )}

      {isThermo && setpoint !== undefined && (
        <div className="mt-2 pt-2 border-t border-neutral-800/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-300 font-medium">Target:</span>
            <span className="text-lg font-bold text-white font-mono tracking-tight">{setpoint}°</span>
          </div>
          <div className="flex items-center gap-1 bg-neutral-800/80 p-0.5 rounded-xl border border-neutral-700/60">
            <button
              onClick={() => update({ temperature: setpoint - 1 })}
              className="w-7 h-7 touch:w-11 touch:h-11 rounded-lg hover:bg-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white transition"
              title="Decrease temperature"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => update({ temperature: setpoint + 1 })}
              className="w-7 h-7 touch:w-11 touch:h-11 rounded-lg hover:bg-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white transition"
              title="Increase temperature"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {isBlinds && (
        <div className="mt-2 pt-2 border-t border-neutral-800/60">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
            <span>Open</span>
            <span className="font-mono text-neutral-300">{device.on ? `${level}%` : "Closed"}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={device.on ? level : 0}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              update({ level: val, on: val > 0 });
            }}
            className="w-full accent-amber-500"
            aria-label={`${device.name} position`}
          />
        </div>
      )}

      {isMedia && (
        <div className="mt-2 pt-2 border-t border-neutral-800/60">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
            <span>Volume</span>
            <span className="font-mono text-neutral-300">{intensity}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={intensity}
            disabled={!device.on}
            onChange={(e) => update({ intensity: parseInt(e.target.value, 10) })}
            className="w-full accent-amber-500 disabled:opacity-30"
            aria-label={`${device.name} volume`}
          />
        </div>
      )}

      {isFan && (
        <div className="mt-2 pt-2 border-t border-neutral-800/60 flex items-center justify-between gap-1">
          {[
            { label: "Off", val: 0 },
            { label: "Low", val: 30 },
            { label: "Med", val: 65 },
            { label: "Max", val: 100 },
          ].map((spd) => {
            const active = device.on ? intensity === spd.val : spd.val === 0;
            return (
              <button
                key={spd.label}
                onClick={() => update({ on: spd.val > 0, intensity: spd.val })}
                className={`flex-1 py-1 touch:min-h-11 touch:text-xs text-[10px] font-semibold rounded-lg border transition ${
                  active
                    ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                    : "bg-neutral-800/60 border-neutral-700/50 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {spd.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
