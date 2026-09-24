import { useId } from "react";

/** Aura's robot mark (same artwork as public/favicon.svg), with an occasional blink. */
export function AuraMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Aura">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
        <radialGradient id={`${id}eye`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="0.45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}bg)`} />
      <line x1="32" y1="12" x2="32" y2="20" stroke="#0c0a09" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="32" cy="10.5" r="4.5" fill="#0c0a09" />
      <circle cx="32" cy="10.5" r="2" fill="#fde68a" className="aura-antenna" />
      <rect x="7" y="30" width="5" height="13" rx="2.5" fill="#0c0a09" />
      <rect x="52" y="30" width="5" height="13" rx="2.5" fill="#0c0a09" />
      <rect x="11" y="19" width="42" height="35" rx="12" fill="#0c0a09" />
      <g className="aura-eyes">
        <circle cx="23.5" cy="34" r="5.5" fill={`url(#${id}eye)`} />
        <circle cx="40.5" cy="34" r="5.5" fill={`url(#${id}eye)`} />
        <circle cx="21.8" cy="32.2" r="1.6" fill="#fffbeb" />
        <circle cx="38.8" cy="32.2" r="1.6" fill="#fffbeb" />
      </g>
      <path d="M24.5 45 Q32 50 39.5 45" stroke="#fbbf24" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
