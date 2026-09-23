import type { Device } from "../../shared/types.ts";
import { DeviceIcon } from "../icons.tsx";

function stateLabel(d: Device): string {
  switch (d.type) {
    case "light":
      return d.on ? `On · ${d.level ?? 100}%` : "Off";
    case "thermostat":
      return `${d.temperature ?? 70}°F`;
    case "lock":
      return d.locked ? "Locked" : "Unlocked";
    case "blinds":
      return d.on ? `Open · ${d.level ?? 100}%` : "Closed";
    case "fan":
      return d.on ? `On · ${d.intensity ?? 0}%` : "Off";
    case "media":
      return d.on ? `On · Vol ${d.intensity ?? 0}` : "Off";
    default:
      return d.on ? "On" : "Off";
  }
}

function isActive(d: Device): boolean {
  return d.type === "lock" ? !!d.locked : d.on;
}

export function DeviceCard({
  device,
  flash,
  onToggle,
}: {
  device: Device;
  flash: boolean;
  onToggle: (d: Device) => void;
}) {
  const active = isActive(device);
  return (
    <button
      className={`device type-${device.type} ${active ? "on" : ""} ${flash ? "flash" : ""}`}
      onClick={() => onToggle(device)}
      title="Click to toggle"
    >
      <div className="device-top">
        <div className="device-icon">
          <DeviceIcon type={device.type} />
        </div>
        <span className={`switch ${active ? "on" : ""}`} aria-hidden />
      </div>
      <div>
        <div className="device-name">{device.name}</div>
        <div className="device-state">{stateLabel(device)}</div>
      </div>
    </button>
  );
}
