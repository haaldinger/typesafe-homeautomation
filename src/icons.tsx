import type { DeviceType } from "../shared/types.ts";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function DeviceIcon({ type, size = 20 }: { type: DeviceType; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24" };
  switch (type) {
    case "light":
      return (
        <svg {...s}>
          <path {...P} d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
        </svg>
      );
    case "thermostat":
      return (
        <svg {...s}>
          <path {...P} d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z" />
          <path {...P} d="M12 9v6" />
        </svg>
      );
    case "lock":
      return (
        <svg {...s}>
          <rect {...P} x="5" y="11" width="14" height="9" rx="2" />
          <path {...P} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "blinds":
      return (
        <svg {...s}>
          <rect {...P} x="4" y="3" width="16" height="18" rx="1" />
          <path {...P} d="M4 8h16M4 12h16M4 16h16" />
        </svg>
      );
    case "fan":
      return (
        <svg {...s}>
          <circle {...P} cx="12" cy="12" r="1.6" />
          <path {...P} d="M12 10.4c0-3 .4-6-1.5-6.5C8.8 3.5 8 6 12 10.4Zm1.6 1.6c3 0 6 .4 6.5-1.5.4-1.7-2.1-2.5-6.5 1.5Zm-1.6 1.6c0 3-.4 6 1.5 6.5 1.7.4 2.5-2.1-1.5-6.5Zm-1.6-1.6c-3 0-6-.4-6.5 1.5-.4 1.7 2.1 2.5 6.5-1.5Z" />
        </svg>
      );
    case "media":
      return (
        <svg {...s}>
          <rect {...P} x="3" y="4" width="18" height="13" rx="2" />
          <path {...P} d="M8 21h8M12 17v4" />
        </svg>
      );
    default:
      return null;
  }
}
