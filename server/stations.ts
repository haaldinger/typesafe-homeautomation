// Curated internet-radio stations (iHeart + SomaFM) that the app can
// start directly on a Sonos zone. Organized by region/category.

export interface Station {
  id: string;
  name: string;
  url: string;
  category?: string;
}

export const STATIONS: Station[] = [
  // ---- SomaFM (Ambient / Chill) ----
  { id: "somafm-chill", category: "SomaFM", name: "Groove Salad", url: "http://ice1.somafm.com/groovesalad-128-mp3" },
  { id: "somafm-jazz", category: "SomaFM", name: "Sonic Universe", url: "http://ice1.somafm.com/sonicuniverse-128-mp3" },
  { id: "somafm-pop", category: "SomaFM", name: "Indie Pop", url: "http://ice1.somafm.com/indiepop-128-mp3" },
  { id: "somafm-electronic", category: "SomaFM", name: "Beat Blender", url: "http://ice1.somafm.com/beatblender-128-mp3" },
  { id: "somafm-ambient", category: "SomaFM", name: "Drone Zone", url: "http://ice1.somafm.com/dronezone-128-mp3" },
  { id: "somafm-rock", category: "SomaFM", name: "BAGeL Radio", url: "http://ice1.somafm.com/bagel-128-mp3" },

  // ---- iHeart Baltimore ----
  { id: "iheart-92q", category: "iHeart Baltimore", name: "92Q (Hip Hop / R&B)", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/WERQFMAAC.aac" },

  // ---- iHeart New York ----
  { id: "iheart-z100", category: "iHeart New York", name: "Z100 (Top 40 Hits)", url: "https://stream.revma.ihrhls.com/zc1469" },
  { id: "iheart-ktu", category: "iHeart New York", name: "103.5 KTU (Dance / Throwback)", url: "https://stream.revma.ihrhls.com/zc1473" },
  { id: "iheart-power105", category: "iHeart New York", name: "Power 105.1 (Hip Hop / R&B)", url: "https://stream.revma.ihrhls.com/zc1481" },
  { id: "iheart-hot97", category: "iHeart New York", name: "Hot 97 (Hip Hop / Culture)", url: "https://18303.live.streamtheworld.com:443/WQHTAAC_SC" },

  // ---- iHeart Miami ----
  { id: "iheart-y100", category: "iHeart Miami", name: "Y100.7 (Top 40)", url: "https://stream.revma.ihrhls.com/zc561" },
  { id: "iheart-beat103", category: "iHeart Miami", name: "103.5 The Beat (Hip Hop / R&B)", url: "https://stream.revma.ihrhls.com/zc581" },
  { id: "iheart-99jamz", category: "iHeart Miami", name: "99 JAMZ (Hip Hop / R&B)", url: "https://cmg.streamguys1.com/mia991/mia991-encoder.aac/playlist.m3u8" },

  // ---- iHeart Los Angeles ----
  { id: "iheart-kiis", category: "iHeart Los Angeles", name: "102.7 KIIS FM (Top 40)", url: "https://stream.revma.ihrhls.com/zc185" },
  { id: "iheart-alt987", category: "iHeart Los Angeles", name: "ALT 98.7 (Alternative Rock)", url: "https://stream.revma.ihrhls.com/zc201" },
  { id: "iheart-real923", category: "iHeart Los Angeles", name: "Real 92.3 (Hip Hop / R&B)", url: "https://stream.revma.ihrhls.com/zc181" },

  // ---- iHeart Philadelphia ----
  { id: "iheart-wdas", category: "iHeart Philadelphia", name: "105.3 WDAS (R&B / Throwbacks)", url: "https://stream.revma.ihrhls.com/zc1993" },
  { id: "iheart-q102", category: "iHeart Philadelphia", name: "Q102 (Top 40 Hits)", url: "https://stream.revma.ihrhls.com/zc1997" },
  { id: "iheart-power99", category: "iHeart Philadelphia", name: "Power 99 (Hip Hop / R&B)", url: "https://stream.revma.ihrhls.com/zc2009" },

  // ---- iHeart Central PA ----
  { id: "iheart-fm97", category: "iHeart Central PA", name: "FM97 (Pop Hits)", url: "https://stream.revma.ihrhls.com/zc2776" },
  { id: "iheart-x1057", category: "iHeart Central PA", name: "105.7 X (Rock)", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/WQXAFMAAC.aac" },
  { id: "iheart-wtpa", category: "iHeart Central PA", name: "93.5 WTPA (Classic Rock)", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/WTPAFMAAC.aac" },
  { id: "iheart-river973", category: "iHeart Central PA", name: "The River 97.3 (Rock Variety)", url: "https://stream.revma.ihrhls.com/zc1985" },
  { id: "iheart-real993", category: "iHeart Central PA", name: "Real 99.3 (Hip Hop / R&B)", url: "https://stream.revma.ihrhls.com/zc1981" },

  // ---- International / Specialty ----
  { id: "heart90s", category: "International", name: "Heart 90s (UK - 90s Pop)", url: "https://media-ssl.musicradio.com/Heart90sMP3" },
  { id: "on2000s", category: "International", name: "0 N 2000s (Global - 2000s Hits)", url: "https://0n-2000s.radionetz.de/0n-2000s.mp3" },
  { id: "labgate", category: "International", name: "Labgate Alt Rock Grunge (90s Rock)", url: "https://s2.ssl-stream.com/listen/labgate_alt_rock_grunge/radio.mp3" },
  { id: "nts", category: "Specialty", name: "NTS Radio (Eclectic / Indie)", url: "https://stream-relay-geo.ntslive.net/stream" },
];

export function stationById(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}
