# Aura — Smart Home, Powered by TypeSafe

A modern web app for controlling Sonos speakers with natural language voice commands, radio station management, and Spotify integration. Built with TypeSafe NLU for intelligent command parsing.

## What It Does

**Aura** lets you:
- 🎵 **Play radio stations** — 29 curated stations (SomaFM, iHeart, etc.) with instant selection
- 🎤 **Voice commands** — Ask for anything: "play jazz on the kitchen speaker", "pause", "next track"
- 🎶 **Spotify playback** — Search and play tracks directly to any speaker
- 🔊 **Volume control** — Adjust per-speaker or whole-house
- 📱 **Multi-room** — Group speakers, control independently
- 💾 **Favorites** — Quick-access to saved stations and playlists
- 🌙 **Mobile-first UI** — Responsive design, works on phones and tablets

## Quick Setup for Tech Talk

### Prerequisites
- Node.js 20+
- Sonos speaker(s) on your WiFi
- Optional: Spotify account for linked playback

### 3-Minute Setup

1. **Clone:**
   ```bash
   git clone https://github.com/haaldinger/typesafe-homeautomation.git
   cd typesafe-homeautomation
   npm install
   ```

2. **Find speaker IP:**
   - Sonos app → Settings → About My System → IP Address
   - Example: `192.168.1.125`

3. **Configure `.env`:**
   ```
   SONOS_HOSTS=192.168.1.125
   SONOS_MODE=direct
   ```

4. **Run:**
   ```bash
   npm run dev
   ```

5. **Open browser:**
   ```
   http://localhost:5173
   ```
   (Or on same WiFi: `http://<your-laptop-ip>:5173`)

**That's it!** Everything else works out of the box.

## How to Use

### Radio
1. Click **Radio** tab
2. Select a station from categories (SomaFM, iHeart, etc.)
3. Music plays instantly

### Voice
1. Click 🎤 button
2. Say: "Play jazz", "pause", "next track", "volume up"

### Spotify
1. Click **Search** tab
2. Type artist/track
3. Click **Play**

### Volume
- Click zone and drag slider
- Or click +/- buttons

## Tech Stack

**Frontend:** React + TypeScript + Vite  
**Backend:** Express.js + TypeSafe NLU  
**Sonos:** Direct SOAP/UPnP protocol over IP  
**Spotify:** Web API integration  

## File Structure

```
├── server/
│   ├── index.ts           # Express API
│   ├── sonos-direct.ts    # Sonos SOAP control
│   ├── stations.ts        # 29 radio stations
│   ├── spotify.ts         # Spotify integration
│   └── resolve.ts         # Command routing
├── src/
│   ├── App.tsx            # Main component
│   ├── components/        # ZoneDetail, etc.
│   └── api.ts             # API client
└── shared/
    └── types.ts           # TypeScript types
```

## Features

✅ Radio station selection (29 preloaded)  
✅ Spotify search & playback  
✅ Voice commands via TypeSafe NLU  
✅ Multi-zone control  
✅ Mobile responsive  
✅ Room name auto-detection  
❌ EQ controls (hardware limitation)  
❌ Voice Spotify (TODO)  

## Environment Variables

```
SONOS_HOSTS=192.168.1.125,192.168.1.126  # Your speaker IPs
SONOS_MODE=direct                         # Use real speakers
SPOTIFY_CLIENT_ID=***                     # Optional: for Spotify
SPOTIFY_CLIENT_SECRET=***
TYPESAFE_API_KEY=***                      # For voice commands
```

## API Endpoints

- `GET /api/zones` — List all speakers
- `POST /api/zone-control` — Play, pause, volume
- `POST /api/radio/play` — Start radio station
- `POST /api/spotify/play` — Play Spotify track
- `GET /api/stations` — All radio stations
- `POST /api/eq` — Bass/treble adjustments

## Demo Tips

- Pre-stage your Sonos speaker on WiFi before the demo
- Set `SONOS_HOSTS` to the speaker's IP
- Radio stations load instantly — no setup needed
- Voice works great with a quick sound check first
- Mobile browser shows the responsive design best

## Next Steps / TODO

- [ ] Voice commands for Spotify playback
- [ ] Real-time UI sync with speaker state
- [ ] EQ control support
- [ ] Progress bar on tracks
- [ ] Playback history
