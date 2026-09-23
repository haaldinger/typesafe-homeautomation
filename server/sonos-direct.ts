// Direct Sonos UPnP control — talks to speakers by IP over SOAP, bypassing SSDP
// discovery (which is often blocked by firewalls / managed networks). Configure
// with SONOS_HOSTS=ip1,ip2 in .env. Handles transport, volume, and now-playing.

import type { AudioAction, EqState, Favorite, QueueTrack, SonosZone } from "../shared/types.ts";
import { getSpotifyTracks } from "./spotify.ts";

const AV = {
  type: "urn:schemas-upnp-org:service:AVTransport:1",
  control: "/MediaRenderer/AVTransport/Control",
};
const RC = {
  type: "urn:schemas-upnp-org:service:RenderingControl:1",
  control: "/MediaRenderer/RenderingControl/Control",
};
const CD = {
  type: "urn:schemas-upnp-org:service:ContentDirectory:1",
  control: "/MediaServer/ContentDirectory/Control",
};

export function directHosts(): string[] {
  return (process.env.SONOS_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function directEnabled(): boolean {
  return directHosts().length > 0;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "zone";
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Start an internet-radio stream on a zone via SetAVTransportURI + Play. */
async function startStation(ip: string, url: string, title: string): Promise<void> {
  // Sonos radio URIs carry the stream host/path without the http(s) scheme.
  const uri = `x-rincon-mp3radio://${url.replace(/^https?:\/\//, "")}`;
  const didl =
    `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ` +
    `xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">` +
    `<item id="R:0/0/0" parentID="R:0/0" restricted="true"><dc:title>${escapeXml(title)}</dc:title>` +
    `<upnp:class>object.item.audioItem.audioBroadcast</upnp:class></item></DIDL-Lite>`;
  await soap(
    ip,
    AV,
    "SetAVTransportURI",
    `${IID}<CurrentURI>${escapeXml(uri)}</CurrentURI><CurrentURIMetaData>${escapeXml(didl)}</CurrentURIMetaData>`,
  );
  await soap(ip, AV, "Play", `${IID}<Speed>1</Speed>`);
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? m[1] : undefined;
}

function hmsToSec(hms?: string): number {
  if (!hms) return 0;
  const parts = hms.split(":").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

async function soap(ip: string, svc: { type: string; control: string }, action: string, body: string): Promise<string> {
  const soapBody = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${svc.type}">${body}</u:${action}></s:Body></s:Envelope>`;
  try {
    const res = await fetch(`http://${ip}:1400${svc.control}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPACTION: `"${svc.type}#${action}"`,
      },
      body: soapBody,
      signal: AbortSignal.timeout(4000),
    });
    const text = await res.text();
    if (!res.ok) {
      if (action.includes("Bass") || action.includes("Treble") || action.includes("Loudness") || action.includes("EQ")) {
        console.error(`[SOAP ${action}] Status ${res.status}`, text.slice(0, 500));
      }
      throw new Error(`Sonos ${ip} ${action} ${res.status}`);
    }
    return text;
  } catch (e) {
    if (action.includes("Bass") || action.includes("Treble") || action.includes("Loudness") || action.includes("EQ")) {
      console.error(`[SOAP ${action}] Error on ${ip}:`, e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
    }
    throw e;
  }
}

const IID = "<InstanceID>0</InstanceID>";
const roomCache = new Map<string, string>();
const uuidCache = new Map<string, string>();

async function roomName(ip: string): Promise<string> {
  if (roomCache.has(ip)) return roomCache.get(ip)!;
  try {
    const xml = await (await fetch(`http://${ip}:1400/xml/device_description.xml`, { signal: AbortSignal.timeout(4000) })).text();
    const name = tag(xml, "roomName") ?? ip;
    const udn = (tag(xml, "UDN") ?? "").replace(/^uuid:/, "");
    roomCache.set(ip, name);
    if (udn) uuidCache.set(ip, udn);
    return name;
  } catch {
    return ip;
  }
}

async function uuidForIp(ip: string): Promise<string | undefined> {
  if (!uuidCache.has(ip)) await roomName(ip);
  return uuidCache.get(ip);
}

async function zoneFor(ip: string): Promise<SonosZone> {
  const name = await roomName(ip);
  const base: SonosZone = { id: slug(name), name, playback: "stopped", track: null, volume: 20, groupedWith: [] };
  try {
    const [transport, position, volume] = await Promise.all([
      soap(ip, AV, "GetTransportInfo", IID),
      soap(ip, AV, "GetPositionInfo", IID),
      soap(ip, RC, "GetVolume", `${IID}<Channel>Master</Channel>`),
    ]);

    const state = tag(transport, "CurrentTransportState");
    base.playback = state === "PLAYING" ? "playing" : state === "PAUSED_PLAYBACK" ? "paused" : "stopped";
    base.volume = parseInt(tag(volume, "CurrentVolume") ?? "20", 10) || 20;
    base.duration = hmsToSec(tag(position, "TrackDuration"));
    base.elapsed = hmsToSec(tag(position, "RelTime"));

    const meta = tag(position, "TrackMetaData");
    if (meta && meta !== "NOT_IMPLEMENTED") {
      const didl = unescapeXml(meta);
      const title = unescapeXml(tag(didl, "dc:title") ?? "");
      const artist = unescapeXml(tag(didl, "dc:creator") ?? tag(didl, "upnp:artist") ?? "");
      const album = unescapeXml(tag(didl, "upnp:album") ?? "");
      let art = tag(didl, "upnp:albumArtURI");
      if (art && art.startsWith("/")) art = `http://${ip}:1400${art}`;
      if (title) {
        base.track = { title, artist: artist || "", ...(album ? { album } : {}) };
        if (art) base.art = art;
      }
      // For radio stations, use cached name if title looks like URL params or stream file
      const cachedRadio = lastRadioByZone.get(base.id);
      const isUglyUrl = title && (/[?&]/.test(title) || /\.(aac|m3u|pls|mp3|flac|ogg)$/i.test(title) || /^[A-Z0-9]{6,}$/.test(title));
      if (isUglyUrl) {
        console.log(`[Radio] Zone ${base.id}: title looks like URL/stream. Cache hit: ${cachedRadio ? cachedRadio.name : "NO CACHE"}`);
      }
      if ((isUglyUrl || !title) && cachedRadio && Date.now() - cachedRadio.timestamp < 300000) {
        // Use cached station name if title is missing/ugly and cache is less than 5 minutes old
        console.log(`[Radio] Using cached name: "${cachedRadio.name}"`);
        base.track = { title: cachedRadio.name, artist: "Radio" };
      } else if (!title || isUglyUrl) {
        lastRadioByZone.delete(base.id);
      }
      captureSpotifyContext(tag(position, "TrackURI"), didl);
      // Queue-played Spotify tracks report no title; resolve it from the id.
      if (!title) {
        const sid = spotifyIdOf(unescapeXml(tag(position, "TrackURI") ?? "") + " " + didl);
        if (sid) {
          const m = (await getSpotifyTracks([sid])).get(sid);
          if (m) {
            base.track = { title: m.title, artist: m.artist, ...(m.album ? { album: m.album } : {}) };
            if (m.art) base.art = m.art;
          }
        }
      }
    }
  } catch {
    // Leave defaults if the speaker didn't answer.
  }
  return base;
}

export async function getDirectZones(): Promise<SonosZone[]> {
  return Promise.all(directHosts().map(zoneFor));
}

/** Split a DIDL-Lite result into its individual <item> blocks. */
function itemsOf(didl: string): string[] {
  const out: string[] = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(didl))) out.push(m[0]);
  return out;
}

function attr(xml: string, name: string): string | undefined {
  const m = new RegExp(`${name}="([^"]*)"`, "i").exec(xml);
  return m ? m[1] : undefined;
}

/** Read a zone's play queue via the ContentDirectory service. */
export async function getDirectQueue(zoneId: string): Promise<QueueTrack[]> {
  const ip = await ipForZone(zoneId);
  if (!ip) return [];
  try {
    const [browse, position] = await Promise.all([
      soap(
        ip,
        CD,
        "Browse",
        "<ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter>" +
          "<StartingIndex>0</StartingIndex><RequestedCount>250</RequestedCount><SortCriteria></SortCriteria>",
      ),
      soap(ip, AV, "GetPositionInfo", IID),
    ]);
    const curTrack = parseInt(tag(position, "Track") ?? "0", 10) || 0;
    const result = unescapeXml(tag(browse, "Result") ?? "");
    const tracks = itemsOf(result).map((item, i) => {
      const title = unescapeXml(tag(item, "dc:title") ?? "");
      const artist = unescapeXml(tag(item, "dc:creator") ?? tag(item, "upnp:artist") ?? "");
      const album = unescapeXml(tag(item, "upnp:album") ?? "");
      let art = unescapeXml(tag(item, "upnp:albumArtURI") ?? "");
      if (art) {
        if (art.startsWith("/")) art = `http://${ip}:1400${art}`;
      }
      const position = i + 1;
      const res = unescapeXml(tag(item, "res") ?? "");
      return {
        position,
        title,
        artist,
        ...(album ? { album } : {}),
        ...(art ? { art } : {}),
        ...(attr(item, "id") ? { objectId: attr(item, "id") } : {}),
        ...(position === curTrack ? { current: true } : {}),
        _spotifyId: spotifyIdOf(res),
      };
    });

    // Sonos stores cloud-service queue items without titles; resolve via Spotify.
    const ids = tracks.filter((t) => !t.title && t._spotifyId).map((t) => t._spotifyId!);
    if (ids.length) {
      const meta = await getSpotifyTracks(ids);
      for (const t of tracks) {
        const m = t._spotifyId ? meta.get(t._spotifyId) : undefined;
        if (m && !t.title) {
          t.title = m.title;
          t.artist = m.artist;
          if (m.album) (t as QueueTrack).album = m.album;
          if (m.art) (t as QueueTrack).art = m.art;
        }
      }
    }
    return tracks.map(({ _spotifyId, ...t }) => t satisfies QueueTrack);
  } catch {
    return [];
  }
}

/** Extract a Spotify track id from a res/URI string, if present. */
function spotifyIdOf(s: string): string | undefined {
  return /spotify(?:%3a|:)track(?:%3a|:)([A-Za-z0-9]+)/.exec(s)?.[1];
}

/** Jump to a queue position (1-based) and play, or remove a track. */
export async function queueControlDirect(zoneId: string, op: "play" | "remove", position: number): Promise<void> {
  const ip = await ipForZone(zoneId);
  if (!ip) return;
  if (op === "play") {
    // Ensure the queue is the active source (it may be radio/Spotify Connect now).
    const uuid = await uuidForIp(ip);
    if (uuid) {
      await soap(ip, AV, "SetAVTransportURI", `${IID}<CurrentURI>x-rincon-queue:${uuid}#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`);
    }
    await soap(ip, AV, "Seek", `${IID}<Unit>TRACK_NR</Unit><Target>${position}</Target>`);
    await soap(ip, AV, "Play", `${IID}<Speed>1</Speed>`);
  } else {
    await soap(ip, AV, "RemoveTrackFromQueue", `${IID}<ObjectID>Q:0/${position}</ObjectID><UpdateID>0</UpdateID>`);
  }
}

/** Play an arbitrary internet-radio stream URL on a zone. */
export async function playRadioDirect(zoneId: string, url: string, name: string): Promise<void> {
  const ip = await ipForZone(zoneId);
  if (!ip) throw new Error("Zone not found");
  lastRadioByZone.set(zoneId, { name, timestamp: Date.now() });
  await startStation(ip, url, name);
}

/** Read a zone's sound / EQ settings. */
export async function getEqDirect(zoneId: string): Promise<EqState> {
  const fallback: EqState = { bass: 0, treble: 0, night: false, loudness: true };
  const ip = await ipForZone(zoneId);
  if (!ip) return fallback;
  try {
    const [bass, treble, night, loud] = await Promise.all([
      soap(ip, RC, "GetBass", `${IID}<Channel>Master</Channel>`),
      soap(ip, RC, "GetTreble", `${IID}<Channel>Master</Channel>`),
      soap(ip, RC, "GetEQ", `${IID}<EQType>NightMode</EQType>`),
      soap(ip, RC, "GetLoudness", `${IID}<Channel>Master</Channel>`),
    ]);
    return {
      bass: parseInt(tag(bass, "CurrentBass") ?? "0", 10) || 0,
      treble: parseInt(tag(treble, "CurrentTreble") ?? "0", 10) || 0,
      night: (tag(night, "CurrentValue") ?? "0") === "1",
      loudness: (tag(loud, "CurrentLoudness") ?? "1") === "1",
    };
  } catch {
    return fallback;
  }
}

/** Update one sound / EQ field on a zone using SOAP. */
export async function setEqDirect(zoneId: string, field: keyof EqState, value: number | boolean): Promise<void> {
  const ip = await ipForZone(zoneId);
  if (!ip) return;
  try {
    switch (field) {
      case "bass":
        await soap(ip, RC, "SetBass", `${IID}<Channel>Master</Channel><DesiredBass>${Number(value)}</DesiredBass>`);
        console.log(`[EQ] Set bass to ${value} on ${zoneId}`);
        break;
      case "treble":
        await soap(ip, RC, "SetTreble", `${IID}<Channel>Master</Channel><DesiredTreble>${Number(value)}</DesiredTreble>`);
        console.log(`[EQ] Set treble to ${value} on ${zoneId}`);
        break;
      case "night":
        await soap(ip, RC, "SetEQ", `${IID}<EQType>NightMode</EQType><DesiredValue>${Boolean(value) ? 1 : 0}</DesiredValue>`);
        console.log(`[EQ] Set night mode to ${value} on ${zoneId}`);
        break;
      case "loudness":
        await soap(ip, RC, "SetLoudness", `${IID}<Channel>Master</Channel><DesiredLoudness>${Boolean(value) ? 1 : 0}</DesiredLoudness>`);
        console.log(`[EQ] Set loudness to ${value} on ${zoneId}`);
        break;
    }
  } catch (e) {
    console.error(`[EQ] Failed to set ${field}=${value} on ${zoneId}:`, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** Read the household's saved Sonos favorites (FV:2). */
export async function getDirectFavorites(): Promise<Favorite[]> {
  const ip = directHosts()[0];
  if (!ip) return [];
  try {
    const browse = await soap(
      ip,
      CD,
      "Browse",
      "<ObjectID>FV:2</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter>" +
        "<StartingIndex>0</StartingIndex><RequestedCount>250</RequestedCount><SortCriteria></SortCriteria>",
    );
    const result = unescapeXml(tag(browse, "Result") ?? "");
    return itemsOf(result).map((item, i) => {
      const title = unescapeXml(tag(item, "dc:title") ?? "");
      const description = unescapeXml(tag(item, "r:description") ?? "");
      let art = tag(item, "upnp:albumArtURI");
      if (art) {
        art = unescapeXml(art);
        if (art.startsWith("/")) art = `http://${ip}:1400${art}`;
      }
      return {
        id: attr(item, "id") ?? `FV:2/${i}`,
        title,
        ...(description ? { description } : {}),
        ...(art ? { art } : {}),
      } satisfies Favorite;
    });
  } catch {
    return [];
  }
}

/** Play a saved favorite on a zone by its object id. */
export async function playFavoriteDirect(zoneId: string, favoriteId: string): Promise<void> {
  const ip = await ipForZone(zoneId);
  if (!ip) return;
  const browse = await soap(
    ip,
    CD,
    "Browse",
    "<ObjectID>FV:2</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter>" +
      "<StartingIndex>0</StartingIndex><RequestedCount>250</RequestedCount><SortCriteria></SortCriteria>",
  );
  const result = unescapeXml(tag(browse, "Result") ?? "");
  const item = itemsOf(result).find((it) => attr(it, "id") === favoriteId);
  if (!item) throw new Error("Favorite not found");
  // res + r:resMD are already escaped once for embedding in a SOAP body.
  const res = tag(item, "res") ?? "";
  const resMD = tag(item, "r:resMD") ?? "";
  if (!res) throw new Error("Favorite has no playable resource");
  if (res.includes("x-rincon-cpcontainer") || res.startsWith("x-rincon-playlist")) {
    // Containers (playlists/albums): replace the queue then play it.
    await soap(ip, AV, "RemoveAllTracksFromQueue", IID);
    await soap(
      ip,
      AV,
      "AddURIToQueue",
      `${IID}<EnqueuedURI>${res}</EnqueuedURI><EnqueuedURIMetaData>${resMD}</EnqueuedURIMetaData>` +
        "<DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>1</EnqueueAsNext>",
    );
    await soap(ip, AV, "SetAVTransportURI", `${IID}<CurrentURI>x-rincon-queue:RINCON#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`);
  } else {
    await soap(ip, AV, "SetAVTransportURI", `${IID}<CurrentURI>${res}</CurrentURI><CurrentURIMetaData>${resMD}</CurrentURIMetaData>`);
  }
  await soap(ip, AV, "Play", `${IID}<Speed>1</Speed>`);
}

// ---- Spotify playback (reuses the account context of the current track) ------

let spotifyCtx: { sid: string; sn: string; desc: string } | null = null;

// ---- Radio station name caching (so display shows "Hot 97" not "WQHTAAC_SC") ------
const lastRadioByZone = new Map<string, { name: string; timestamp: number }>();

function captureSpotifyContext(trackUri: string | undefined, didl: string): void {
  // During Spotify Connect the transport is x-sonos-vli:, but the metadata's
  // <res> still carries the real x-sonos-spotify URI with the account sid/sn.
  const resUri = tag(didl, "res") ?? "";
  const source = resUri.includes("x-sonos-spotify") ? resUri : trackUri ?? "";
  if (!source.includes("x-sonos-spotify") && !resUri.includes("spotify")) return;
  const sid = /sid=(\d+)/.exec(resUri)?.[1] ?? /sid=(\d+)/.exec(trackUri ?? "")?.[1];
  const sn = /sn=(\d+)/.exec(resUri)?.[1] ?? /sn=(\d+)/.exec(trackUri ?? "")?.[1];
  const desc = tag(didl, "desc");
  if (sid && sn) spotifyCtx = { sid, sn, desc: desc ?? spotifyCtx?.desc ?? "" };
}

export function spotifyLinked(): boolean {
  // Need the account token (cdudn desc), not just sid/sn, to actually stream.
  return spotifyCtx !== null && spotifyCtx.desc !== "";
}

/** Debug: dump raw transport URIs + metadata for a zone. */
export async function rawTransportDirect(zoneId: string): Promise<Record<string, string>> {
  const ip = await ipForZone(zoneId);
  if (!ip) return { error: "no ip" };
  const [pos, med, queue] = await Promise.all([
    soap(ip, AV, "GetPositionInfo", IID),
    soap(ip, AV, "GetMediaInfo", IID),
    soap(
      ip,
      CD,
      "Browse",
      "<ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter>" +
        "<StartingIndex>0</StartingIndex><RequestedCount>3</RequestedCount><SortCriteria></SortCriteria>",
    ),
  ]);
  return {
    trackUri: tag(pos, "TrackURI") ?? "",
    currentUri: tag(med, "CurrentURI") ?? "",
    trackMeta: unescapeXml(tag(pos, "TrackMetaData") ?? "").slice(0, 700),
    queueRaw: unescapeXml(tag(queue, "Result") ?? "").slice(0, 1400),
    accounts: await fetch(`http://${ip}:1400/status/accounts`, { signal: AbortSignal.timeout(4000) })
      .then((r) => r.text())
      .then((t) => t.slice(0, 1200))
      .catch(() => "err"),
    ctx: spotifyCtx ? JSON.stringify(spotifyCtx) : "none",
  };
}

/** Add a Spotify track to the zone's Sonos queue, optionally playing it now. */
export async function playSpotifyDirect(
  zoneId: string,
  spotifyUri: string,
  title = "Spotify",
  mode: "now" | "end" = "now",
): Promise<void> {
  const ip = await ipForZone(zoneId);
  if (!ip) throw new Error("Zone not found");
  if (!spotifyCtx || !spotifyCtx.desc) {
    throw new Error(
      "Spotify isn't linked to your Sonos system, so it can't stream here. In the Sonos app: Settings → Services & Voice → Add a Service → Spotify, sign in, then play any song once. (Casting via Spotify Connect alone doesn't let Aura control playback.)",
    );
  }
  const id = spotifyUri.split(":").pop() ?? "";
  const encoded = `spotify%3atrack%3a${id}`;
  const enqueuedUri = `x-sonos-spotify:${encoded}?sid=${spotifyCtx.sid}&amp;flags=8224&amp;sn=${spotifyCtx.sn}`;
  const descEl = spotifyCtx.desc
    ? `<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">${escapeXml(spotifyCtx.desc)}</desc>`
    : "";
  const didl =
    `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ` +
    `xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">` +
    `<item id="00032020${encoded}" parentID="00020000spotify" restricted="true"><dc:title>${escapeXml(title)}</dc:title>` +
    `<upnp:class>object.item.audioItem.musicTrack</upnp:class>${descEl}</item></DIDL-Lite>`;

  // Add to the Sonos queue so Next/Prev work and full metadata loads.
  if (mode === "now") {
    // "Play now" starts a clean queue with just this track, then plays it.
    await soap(ip, AV, "RemoveAllTracksFromQueue", IID);
  }
  const addRes = await soap(
    ip,
    AV,
    "AddURIToQueue",
    `${IID}<EnqueuedURI>${enqueuedUri}</EnqueuedURI><EnqueuedURIMetaData>${escapeXml(didl)}</EnqueuedURIMetaData>` +
      `<DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>${mode === "now" ? 1 : 0}</EnqueueAsNext>`,
  );

  if (mode === "now") {
    const pos = parseInt(tag(addRes, "FirstTrackNumberEnqueued") ?? "1", 10) || 1;
    const uuid = await uuidForIp(ip);
    if (uuid) {
      await soap(ip, AV, "SetAVTransportURI", `${IID}<CurrentURI>x-rincon-queue:${uuid}#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`);
    }
    await soap(ip, AV, "Seek", `${IID}<Unit>TRACK_NR</Unit><Target>${pos}</Target>`);
    await soap(ip, AV, "Play", `${IID}<Speed>1</Speed>`);
  }
}

async function ipForZone(zoneId: string): Promise<string | undefined> {
  for (const ip of directHosts()) {
    if (slug(await roomName(ip)) === zoneId) return ip;
  }
  return directHosts()[0];
}

export async function applyDirect(actions: AudioAction[]): Promise<void> {
  for (const a of actions) {
    const ip = await ipForZone(a.zone);
    if (!ip) continue;
    switch (a.kind) {
      case "play":
      case "resume":
      case "play_favorite":
        await soap(ip, AV, "Play", `${IID}<Speed>1</Speed>`);
        break;
      case "pause":
        await soap(ip, AV, "Pause", IID);
        break;
      case "stop":
        await soap(ip, AV, "Stop", IID);
        break;
      case "next":
        await soap(ip, AV, "Next", IID);
        break;
      case "previous":
        await soap(ip, AV, "Previous", IID);
        break;
      case "volume_up":
      case "volume_down": {
        const cur = parseInt(tag(await soap(ip, RC, "GetVolume", `${IID}<Channel>Master</Channel>`), "CurrentVolume") ?? "20", 10);
        const next = Math.max(0, Math.min(100, cur + (a.kind === "volume_up" ? 10 : -10)));
        await soap(ip, RC, "SetVolume", `${IID}<Channel>Master</Channel><DesiredVolume>${next}</DesiredVolume>`);
        break;
      }
      case "set_volume": {
        const n = parseInt((a.chips[0] ?? "").replace(/\D/g, ""), 10);
        if (!Number.isNaN(n)) await soap(ip, RC, "SetVolume", `${IID}<Channel>Master</Channel><DesiredVolume>${n}</DesiredVolume>`);
        break;
      }
      case "play_station":
        if (a.uri) await playRadioDirect(a.zone, a.uri, a.name ?? a.chips[0] ?? "Radio");
        break;
      default:
        // group/ungroup need topology; single-speaker setups can skip.
        break;
    }
  }
}
