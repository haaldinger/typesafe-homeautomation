import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { EqState, Favorite, QueueTrack, RadioStation, SonosZone, SpotifyResult } from "../../shared/types.ts";
import { fetchEq, fetchFavorites, fetchLyrics, searchRadio, searchSpotify, setEq, type Lyrics } from "../api.ts";

/** Deterministic gradient cover derived from a seed string. */
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

type Tab = "queue" | "radio" | "favorites" | "search" | "lyrics" | "sound";

export function ZoneDetail({
  zone,
  queue,
  stations,
  spotifyEnabled,
  spotifyLinked,
  onClose,
  onControl,
  onQueue,
  onPlayFavorite,
  onPlaySpotify,
  onPlayRadio,
}: {
  zone: SonosZone;
  queue: QueueTrack[];
  stations: { id: string; name: string; category?: string }[];
  spotifyEnabled: boolean;
  spotifyLinked: boolean;
  onClose: () => void;
  onControl: (action: string, value?: number, station?: string) => void;
  onQueue: (op: "play" | "remove", position: number) => void;
  onPlayFavorite: (id: string) => void;
  onPlaySpotify: (uri: string, title: string, mode?: "now" | "end") => void;
  onPlayRadio: (url: string, name: string) => void;
}) {
  const active = zone.playback === "playing";
  const volRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [tab, setTab] = useState<Tab>("queue");

  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<SpotifyResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  const [radioQ, setRadioQ] = useState("");
  const [radioResults, setRadioResults] = useState<RadioStation[]>([]);
  const [radioSearching, setRadioSearching] = useState(false);
  const [radioErr, setRadioErr] = useState<string | null>(null);

  const [eq, setEqState] = useState<EqState | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetchFavorites().then(setFavorites).catch(() => setFavorites([]));
  }, []);

  useEffect(() => {
    if (tab !== "sound") return;
    fetchEq(zone.id).then(setEqState).catch(() => setEqState(null));
  }, [tab, zone.id]);

  async function changeEq(field: keyof EqState, value: number | boolean) {
    console.log(`[changeEq] Setting ${field} to ${value}`);
    setEqState((cur) => (cur ? { ...cur, [field]: value } : cur));
    try {
      const result = await setEq(zone.id, field, value);
      console.log(`[changeEq] Response:`, result);
      setEqState(result);
    } catch (e) {
      console.error(`[changeEq] Error:`, e);
      fetchEq(zone.id).then(setEqState).catch(() => {});
    }
  }

  async function runRadio() {
    const q = radioQ.trim();
    if (!q) return;
    setRadioSearching(true);
    setRadioErr(null);
    try {
      setRadioResults(await searchRadio(q));
    } catch (e) {
      setRadioErr(e instanceof Error ? e.message : "Radio search failed");
      setRadioResults([]);
    } finally {
      setRadioSearching(false);
    }
  }

  const trackKey = `${zone.track?.artist}|${zone.track?.title}`;
  useEffect(() => {
    if (tab !== "lyrics" || !zone.track) return;
    setLyricsLoading(true);
    setLyrics(null);
    fetchLyrics(zone.track.artist, zone.track.title, zone.duration ?? 0)
      .then(setLyrics)
      .catch(() => setLyrics(null))
      .finally(() => setLyricsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, trackKey]);

  const pct =
    zone.duration && zone.elapsed !== undefined ? Math.min(100, (zone.elapsed / zone.duration) * 100) : 0;

  function volFromEvent(clientX: number): number {
    const el = volRef.current;
    if (!el) return zone.volume;
    const r = el.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100);
  }

  async function runSearch() {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr(null);
    try {
      setResults(await searchSpotify(q));
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // Index of the currently-sung synced lyric line.
  const activeLine = useMemo(() => {
    if (!lyrics?.synced.length) return -1;
    const t = zone.elapsed ?? 0;
    let idx = -1;
    for (let i = 0; i < lyrics.synced.length; i++) {
      if (lyrics.synced[i].time <= t) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, zone.elapsed]);

  const activeLineRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLine]);

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="detail-now">
          <div className="detail-art" style={zone.art ? undefined : coverStyle(zone.track?.title ?? zone.name)}>
            {zone.art ? <img src={zone.art} alt="" /> : <span className="detail-art-note">♪</span>}
          </div>
          <div className="detail-info">
            <div className="detail-room">
              {active ? (
                <span className="eq" aria-label="playing">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <span className={`zone-dot ${zone.playback}`} />
              )}
              {zone.name}
            </div>
            {zone.track ? (
              <>
                <div className="detail-title">{zone.track.title}</div>
                <div className="detail-artist">{zone.track.artist}</div>
                {zone.track.album && <div className="detail-album">{zone.track.album}</div>}
              </>
            ) : (
              <div className="detail-artist">Nothing playing</div>
            )}

            <div className="detail-progress">
              <span className="progress-track">
                <span className="progress-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="progress-time">
                {fmt(zone.elapsed ?? 0)} / {fmt(zone.duration ?? 0)}
              </span>
            </div>

            <div className="detail-transport">
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
                onPointerDown={(e) => {
                  dragging.current = true;
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  onControl("set_volume", volFromEvent(e.clientX));
                }}
                onPointerMove={(e) => dragging.current && onControl("set_volume", volFromEvent(e.clientX))}
                onPointerUp={() => (dragging.current = false)}
              >
                <span className="vol-fill" style={{ width: `${zone.volume}%` }} />
                <span className="vol-knob" style={{ left: `${zone.volume}%` }} />
              </div>
              <span className="vol-num">{zone.volume}</span>
            </div>
          </div>
        </div>

        {zone.groupedWith.length > 0 && (
          <div className="detail-grouprow">
            <span className="zone-group">⛓ {zone.groupedWith.join(" · ")}</span>
            <button className="ungroup" onClick={() => onControl("ungroup")}>
              Ungroup
            </button>
          </div>
        )}

        <div className="detail-tabs" role="tablist">
          {(["queue", "radio", "favorites", "search", "lyrics", "sound"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              className={`detail-tab ${tab === t ? "on" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "queue"
                ? "Up Next"
                : t === "radio"
                  ? "Radio"
                  : t === "favorites"
                    ? "Favorites"
                    : t === "search"
                      ? "Search"
                      : t === "lyrics"
                        ? "Lyrics"
                        : "Sound"}
            </button>
          ))}
        </div>

        <div className="detail-tabbody">
          {tab === "queue" && (
            <>
              {queue.length === 0 ? (
                <div className="detail-empty">Queue is empty — pick a station from the Radio tab.</div>
              ) : (
                <ul className="queue">
                  {queue.map((t) => (
                    <li key={t.position} className={`queue-row ${t.current ? "current" : ""}`}>
                      <button className="queue-jump" onClick={() => onQueue("play", t.position)} title={`Play "${t.title || "this track"}" now`}>
                        <span className="queue-play">{t.current && active ? "▶" : t.position}</span>
                        <span className="queue-meta">
                          <span className="queue-title">{t.title || "Unknown"}</span>
                          <span className="queue-artist">{t.artist}</span>
                        </span>
                      </button>
                      <button className="queue-remove" onClick={() => onQueue("remove", t.position)} aria-label="Remove from queue">
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "radio" && (
            <>
              {stations.length > 0 && (
                <>
                  {(() => {
                    const byCategory = new Map<string, typeof stations>();
                    for (const s of stations) {
                      const cat = s.category || "Other";
                      if (!byCategory.has(cat)) byCategory.set(cat, []);
                      byCategory.get(cat)!.push(s);
                    }
                    return Array.from(byCategory.entries()).map(([cat, stns]) => (
                      <div key={cat}>
                        <div className="detail-subhead">{cat}</div>
                        <div className="detail-stations">
                          {stns.map((s) => (
                            <button key={s.id} className="station-chip" onClick={() => onControl("play_station", undefined, s.id)}>
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                  <div className="detail-subhead">Search all stations</div>
                </>
              )}
              <div className="search-row">
                <input
                  value={radioQ}
                  placeholder="Search live radio (e.g. jazz, BBC, KEXP)…"
                  onChange={(e) => setRadioQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runRadio()}
                />
                <button className="search-go" onClick={runRadio} disabled={radioSearching || !radioQ.trim()}>
                  {radioSearching ? "…" : "Search"}
                </button>
              </div>
              {radioErr && <div className="detail-empty error">{radioErr}</div>}
              {!radioErr && radioResults.length === 0 && radioQ.trim() && (
                <div className="detail-empty">No stations found for "{radioQ}". Try a different search.</div>
              )}
              <ul className="queue">
                {radioResults.map((r) => (
                  <li key={r.id} className="queue-row">
                    <span className="fav-art sm" style={r.favicon ? undefined : coverStyle(r.name)}>
                      {r.favicon ? <img src={r.favicon} alt="" onError={(e) => (e.currentTarget.style.display = "none")} /> : <span>📻</span>}
                    </span>
                    <div className="queue-meta">
                      <div className="queue-title">{r.name}</div>
                      <div className="queue-artist">
                        {[r.country, r.codec, r.bitrate ? `${r.bitrate}k` : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button className="search-play" onClick={() => onPlayRadio(r.url, r.name)}>
                      Play
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === "favorites" && (
            <>
              {favorites.length === 0 ? (
                <div className="detail-empty">No saved Sonos favorites found.</div>
              ) : (
                <div className="fav-grid">
                  {favorites.map((f) => (
                    <button key={f.id} className="fav-card" onClick={() => onPlayFavorite(f.id)} title={`Play ${f.title}`}>
                      <span className="fav-art" style={f.art ? undefined : coverStyle(f.title)}>
                        {f.art ? <img src={f.art} alt="" /> : <span>♪</span>}
                      </span>
                      <span className="fav-title">{f.title}</span>
                      {f.description && <span className="fav-desc">{f.description}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "search" && (
            <>
              {!spotifyEnabled ? (
                <div className="detail-empty">
                  Spotify search isn't configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env.
                </div>
              ) : !spotifyLinked ? (
                <div className="detail-empty warning">
                  ⚠️ Spotify isn't linked to your Sonos system. To play tracks:
                  <ol style={{ marginTop: "0.75rem", paddingLeft: "1.25rem" }}>
                    <li>Open the Sonos app</li>
                    <li>Go to Settings → Services & Voice</li>
                    <li>Add Spotify and sign in</li>
                    <li>Play any song once from the app</li>
                  </ol>
                  After linking, you can search and play tracks here.
                </div>
              ) : (
                <>
                  <div className="search-row">
                    <input
                      value={searchQ}
                      placeholder="Search Spotify for a song or artist…"
                      onChange={(e) => setSearchQ(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runSearch()}
                    />
                    <button className="search-go" onClick={runSearch} disabled={searching || !searchQ.trim()}>
                      {searching ? "…" : "Search"}
                    </button>
                  </div>
                  {searchErr && <div className="detail-empty error">{searchErr}</div>}
                  <ul className="queue">
                    {results.map((r) => (
                      <li key={r.id} className="queue-row">
                        <span className="fav-art sm" style={r.art ? undefined : coverStyle(r.name)}>
                          {r.art ? <img src={r.art} alt="" /> : <span>♪</span>}
                        </span>
                        <div className="queue-meta">
                          <div className="queue-title">{r.name}</div>
                          <div className="queue-artist">{r.artist}</div>
                        </div>
                        <div className="search-actions">
                          <button
                            className="search-add"
                            onClick={() => onPlaySpotify(r.uri, `${r.name} — ${r.artist}`, "end")}
                            title="Add to queue"
                            aria-label="Add to queue"
                          >
                            ＋
                          </button>
                          <button className="search-play" onClick={() => onPlaySpotify(r.uri, `${r.name} — ${r.artist}`, "now")}>
                            Play
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {tab === "lyrics" && (
            <>
              {!zone.track ? (
                <div className="detail-empty">Nothing playing.</div>
              ) : lyricsLoading ? (
                <div className="detail-empty">Finding lyrics…</div>
              ) : !lyrics ? (
                <div className="detail-empty">No lyrics found for this track.</div>
              ) : lyrics.synced.length ? (
                <ul className="lyrics synced">
                  {lyrics.synced.map((l, i) => (
                    <li
                      key={i}
                      ref={i === activeLine ? activeLineRef : undefined}
                      className={i === activeLine ? "on" : i < activeLine ? "past" : ""}
                    >
                      {l.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <pre className="lyrics plain">{lyrics.plain}</pre>
              )}
              {lyrics && <div className="lyrics-source">source: {lyrics.source}</div>}
            </>
          )}

          {tab === "sound" && (
            <div className="eq">
              <div className="eq-slider">
                <label>Bass<span>{eq ? (eq.bass > 0 ? `+${eq.bass}` : eq.bass) : "…"}</span></label>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  value={eq?.bass ?? 0}
                  onInput={(e) => {
                    const val = Number((e.target as HTMLInputElement).value);
                    console.log("[EQ] Bass changed to", val);
                    changeEq("bass", val);
                  }}
                  style={{ cursor: "pointer", width: "100%", touchAction: "none" }}
                />
              </div>
              <div className="eq-slider">
                <label>Treble<span>{eq ? (eq.treble > 0 ? `+${eq.treble}` : eq.treble) : "…"}</span></label>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  value={eq?.treble ?? 0}
                  onInput={(e) => {
                    const val = Number((e.target as HTMLInputElement).value);
                    console.log("[EQ] Treble changed to", val);
                    changeEq("treble", val);
                  }}
                  style={{ cursor: "pointer", width: "100%", touchAction: "none" }}
                />
              </div>
              <button className={`eq-toggle ${eq?.night ? "on" : ""}`} onClick={() => changeEq("night", !eq?.night)}>
                <span>Night mode</span>
                <span className="eq-switch" />
              </button>
              <button className={`eq-toggle ${eq?.loudness ? "on" : ""}`} onClick={() => changeEq("loudness", !eq?.loudness)}>
                <span>Loudness</span>
                <span className="eq-switch" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
