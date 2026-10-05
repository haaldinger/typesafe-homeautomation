import { useState } from "react";
import { ChevronRight, Clock3, Layers2, LockKeyhole, Music2, Radar, Thermometer, UnlockKeyhole, X } from "lucide-react";
import type { FlightResponse, NearbyAircraft, SonosZone, HomeState } from "../../shared/types.ts";
import type { HealthInfo } from "../api.ts";
import { WallPanelNav, type WallPanelView } from "./WallPanelNav.tsx";

interface WallPanelShellProps {
  view: WallPanelView;
  home: HomeState | null;
  zones: SonosZone[];
  health: HealthInfo | null;
  flights: FlightResponse | null;
  status: { on: number; temp: number; locks: number; unlocked: number };
  sectionCount: number;
  onChangeView: (view: WallPanelView) => void;
  onOpenScenes: () => void;
  onCollapseAll: () => void;
  onOpenZone: (zoneId: string) => void;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);
}

export function WallPanelShell({
  view,
  home,
  zones,
  health,
  flights,
  status,
  sectionCount,
  onChangeView,
  onOpenScenes,
  onCollapseAll,
  onOpenZone,
}: WallPanelShellProps) {
  const playingZone = zones.find((zone) => zone.playback === "playing");
  const locked = status.locks > 0 && status.unlocked === 0;
  const [selectedAircraft, setSelectedAircraft] = useState<NearbyAircraft | null>(null);

  return (
    <section className="wall-panel-shell" aria-label="Aura wall panel">
      <div className="wall-panel-shell__topline">
        <div className="wall-panel-shell__identity">
          <span className="wall-panel-shell__eyebrow">AURA / HOME</span>
          <span className="wall-panel-shell__state">
            <span className="wall-panel-shell__state-dot" aria-hidden="true" />
            {!home ? "connecting" : health?.profile === "home" ? "connected" : "demo mode"}
          </span>
        </div>
        <WallPanelNav view={view} onChange={onChangeView} />
      </div>

      {view === "home" ? (
        <div className="wall-panel-shell__home">
          <div className="wall-panel-shell__hero">
            <div className="wall-panel-shell__time-row">
              <Clock3 className="h-5 w-5 text-amber-300" aria-hidden="true" />
              <time dateTime={new Date().toISOString()}>{formatTime(new Date())}</time>
            </div>
            <p className="wall-panel-shell__date">{formatDate(new Date())}</p>
            <div className="wall-panel-shell__signal">
              <span>HOME</span>
              <span className="wall-panel-shell__signal-line" aria-hidden="true" />
              <span>{status.on} lights · {locked ? "locked" : `${status.unlocked} unlocked`}</span>
            </div>
          </div>

          <div className="wall-panel-shell__metrics">
            <button type="button" className="wall-panel-shell__metric" onClick={onOpenScenes}>
              <span className="wall-panel-shell__metric-label"><Layers2 className="h-4 w-4" aria-hidden="true" /> Scene</span>
              <strong>{locked ? "Settled" : "Check home"}</strong>
              <span className="wall-panel-shell__metric-action">Open scenes <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
            </button>
            <div className="wall-panel-shell__metric">
              <span className="wall-panel-shell__metric-label"><Thermometer className="h-4 w-4" aria-hidden="true" /> Inside</span>
              <strong>{status.temp ? `${status.temp}°` : "--"}</strong>
              <span className="wall-panel-shell__metric-action">Home Assistant state</span>
            </div>
            <div className="wall-panel-shell__metric">
              <span className="wall-panel-shell__metric-label">
                {locked ? <LockKeyhole className="h-4 w-4" aria-hidden="true" /> : <UnlockKeyhole className="h-4 w-4" aria-hidden="true" />}
                Security
              </span>
              <strong>{status.locks ? (locked ? "Secure" : "Attention") : "No locks"}</strong>
              <span className="wall-panel-shell__metric-action">{status.locks ? `${status.locks} locks tracked` : "No lock entities"}</span>
            </div>
          </div>

          <button type="button" className="wall-panel-shell__sky-link" onClick={() => onChangeView("flights")}>
            <span className="wall-panel-shell__sky-icon"><Radar className="h-5 w-5" aria-hidden="true" /></span>
            <span>
              <span className="wall-panel-shell__sky-label">NEARBY SKY · LNS</span>
              <span className="wall-panel-shell__sky-copy">Flight radar is ready to connect</span>
            </span>
            <ChevronRight className="ml-auto h-5 w-5" aria-hidden="true" />
          </button>

          <div className="wall-panel-shell__media">
            <Music2 className="h-5 w-5 text-amber-300" aria-hidden="true" />
            <span className="wall-panel-shell__media-copy">
              <span>Now playing</span>
              <strong>{playingZone?.source ?? playingZone?.track?.title ?? "Nothing playing"}</strong>
            </span>
            {playingZone && <button type="button" onClick={() => onOpenZone(playingZone.id)}>Open zone <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>}
          </div>

          <div className="wall-panel-shell__actions">
            <span>{sectionCount} sections visible</span>
            <button type="button" onClick={onCollapseAll} disabled={sectionCount === 0}>
              Collapse all
            </button>
          </div>
        </div>
      ) : view === "flights" ? (
        <div className="wall-panel-shell__empty-view">
          <div className="wall-panel-radar-placeholder" aria-hidden="true">
            <span className="wall-panel-radar-placeholder__crosshair" />
            <span className="wall-panel-radar-placeholder__airport">LNS</span>
            <Radar className="wall-panel-radar-placeholder__icon" />
          </div>
          <span className="wall-panel-shell__eyebrow">NEARBY SKY · LNS</span>
          <h2>{flights?.aircraft.length ?? 0} aircraft nearby</h2>
          <p>
            {flights?.source === "demo"
              ? "Demo traffic is ready. The same normalized feed can later come from Home Assistant or an ADS-B receiver."
              : "A server-side ADS-B provider will supply aircraft, freshness, and flight details here."}
          </p>
          {flights && flights.aircraft.length > 0 && (
            <div className="wall-panel-flight-list" aria-label="Nearby aircraft">
              {flights.aircraft.map((aircraft) => (
                <button
                  type="button"
                  className="wall-panel-flight-row"
                  key={aircraft.id}
                  onClick={() => setSelectedAircraft(aircraft)}
                  aria-label={`Open details for ${aircraft.callsign}`}
                >
                  <strong>{aircraft.callsign}</strong>
                  <span>{aircraft.distanceNm ?? "--"} NM</span>
                  <span>{aircraft.altitudeFeet ? `${aircraft.altitudeFeet.toLocaleString()} ft` : "Altitude --"}</span>
                </button>
              ))}
            </div>
          )}
          {selectedAircraft && (
            <div className="wall-panel-flight-detail" aria-label={`${selectedAircraft.callsign} flight details`}>
              <div className="wall-panel-flight-detail__header">
                <div>
                  <span className="wall-panel-shell__eyebrow">SELECTED AIRCRAFT</span>
                  <strong>{selectedAircraft.callsign}</strong>
                </div>
                <button type="button" onClick={() => setSelectedAircraft(null)} aria-label="Close aircraft details">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="wall-panel-flight-detail__grid">
                <span>Operator<strong>{selectedAircraft.operator ?? "Unknown"}</strong></span>
                <span>Aircraft<strong>{selectedAircraft.type ?? "Unknown"}</strong></span>
                <span>Route<strong>{selectedAircraft.origin ?? "--"} to {selectedAircraft.destination ?? "--"}</strong></span>
                <span>Speed<strong>{selectedAircraft.speedKnots ? `${selectedAircraft.speedKnots} kt` : "--"}</strong></span>
                <span>Heading<strong>{selectedAircraft.heading !== undefined ? `${selectedAircraft.heading}°` : "--"}</strong></span>
                <span>Bearing<strong>{selectedAircraft.bearingDeg !== undefined ? `${selectedAircraft.bearingDeg}°` : "--"}</strong></span>
              </div>
            </div>
          )}
          <button type="button" onClick={() => onChangeView("home")}>Back home</button>
        </div>
      ) : (
        <div className="wall-panel-shell__empty-view">
          <div className="wall-panel-history-mark" aria-hidden="true"><span /><span /><span /></div>
          <span className="wall-panel-shell__eyebrow">HOME ASSISTANT HISTORY</span>
          <h2>Trends are the next layer.</h2>
          <p>Aura will read Home Assistant history without creating a second recorder, then turn it into glanceable comparisons.</p>
          <button type="button" onClick={() => onChangeView("home")}>Back home</button>
        </div>
      )}
    </section>
  );
}
