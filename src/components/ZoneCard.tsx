import { useRef } from "react";
import type { CSSProperties } from "react";
import type { SonosZone } from "../../shared/types.ts";

/** Deterministic gradient cover derived from the track title. */
function coverStyle(seed: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 60 + ((h >> 8) % 120)) % 360;
  return { background: `linear-gradient(135deg, hsl(${a} 70% 45%), hsl(${b} 65% 30%))` };
}

function fmt(sec: number): string {
  if (!sec || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function NoteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="17" cy="15.5" r="2.5" />
      <path d="M8.5 18V6l11-2v11.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ZoneCard({
  zone,
  flash,
  onControl,
  onOpen,
}: {
  zone: SonosZone;
  flash: boolean;
  onControl: (action: string, value?: number, station?: string) => void;
  onOpen: () => void;
}) {
  const active = zone.playback === "playing";
  const volRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct =
    zone.duration && zone.elapsed !== undefined ? Math.min(100, (zone.elapsed / zone.duration) * 100) : 0;

  function volFromEvent(clientX: number): number {
    const el = volRef.current;
    if (!el) return zone.volume;
    const r = el.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100);
  }
  function onVolDown(e: React.PointerEvent) {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onControl("set_volume", volFromEvent(e.clientX));
  }
  function onVolMove(e: React.PointerEvent) {
    if (dragging.current) onControl("set_volume", volFromEvent(e.clientX));
  }
  function onVolUp() {
    dragging.current = false;
  }

  return (
    <div className={`zone rich ${active ? "on" : ""} ${flash ? "flash" : ""}`}>
      <div className="zone-head">
        <button
          className="cover cover-btn"
          style={zone.art ? undefined : coverStyle(zone.track?.title ?? zone.name)}
          onClick={onOpen}
          aria-label={`Open ${zone.name} details`}
        >
          {zone.art ? <img src={zone.art} alt="" /> : <NoteIcon />}
          <span className="cover-expand">⤢</span>
        </button>
        <div className="zone-meta">
          <div className="zone-name-row">
            <span className="zone-name">{zone.name}</span>
            {active ? (
              <span className="eq" aria-label="playing">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <span className={`zone-dot ${zone.playback}`} />
            )}
          </div>
          {zone.track ? (
            <>
              <button className="zone-title zone-title-btn" onClick={onOpen}>
                {zone.track.title}
              </button>
              <div className="zone-artist">{zone.track.artist}</div>
            </>
          ) : (
            <div className="zone-artist">Nothing playing</div>
          )}
        </div>
      </div>

      <div className="progress">
        <span className="progress-track">
          <span className="progress-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="progress-time">
          {fmt(zone.elapsed ?? 0)} / {fmt(zone.duration ?? 0)}
        </span>
      </div>

      <div className="transport">
        <button className="tp" onClick={() => onControl("previous")} aria-label="Previous">
          ⏮
        </button>
        <button
          className="tp play"
          onClick={() => onControl(active ? "pause" : "play")}
          aria-label={active ? "Pause" : "Play"}
        >
          {active ? "⏸" : "▶"}
        </button>
        <button className="tp" onClick={() => onControl("next")} aria-label="Next">
          ⏭
        </button>
      </div>

      <div className="vol">
        <span className="vol-icon">🔉</span>
        <div
          className="vol-track"
          ref={volRef}
          onPointerDown={onVolDown}
          onPointerMove={onVolMove}
          onPointerUp={onVolUp}
        >
          <span className="vol-fill" style={{ width: `${zone.volume}%` }} />
          <span className="vol-knob" style={{ left: `${zone.volume}%` }} />
        </div>
        <span className="vol-num">{zone.volume}</span>
      </div>

      {zone.groupedWith.length > 0 && (
        <div className="zone-grouprow">
          <span className="zone-group" title={`Grouped with ${zone.groupedWith.join(", ")}`}>
            ⛓ {zone.groupedWith.join(" · ")}
          </span>
          <button className="ungroup" onClick={() => onControl("ungroup")}>
            Ungroup
          </button>
        </div>
      )}

      <button className="zone-more" onClick={onOpen}>
        Now playing & queue →
      </button>
    </div>
  );
}

