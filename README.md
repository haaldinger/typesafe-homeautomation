# Aura — Smart Home, Powered by TypeSafe

A production-ready smart home app that demonstrates **TypeSafe's System One model (Jev)** for natural language understanding. Control Sonos speakers with voice commands, play radio stations, search Spotify, and manage multi-room audio — all powered by intelligent NLU that understands context and intent.

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐         ┌───────────────┐
│   React UI      │────────▶│  Express Server  │────────▶│ Sonos Speakers│
│  - Radio        │         │  + TypeSafe Jev  │         │   via SOAP/   │
│  - Voice        │◀────────│  - NLU reasoning │◀────────│     UPnP      │
│  - Spotify      │         │  - Command route │         │               │
└─────────────────┘         └──────────────────┘         └───────────────┘
                                    │
                                    ▼
                            ┌──────────────────┐
                            │  Spotify Web API │
                            │  Radio Browser   │
                            └──────────────────┘
```

## What It Does

**Aura** is a voice-first smart home controller that uses TypeSafe's Jev (System One) model to parse natural language and route commands to devices:

### Core Features
- 🎤 **Voice Commands** — "Play jazz on the kitchen speaker", "pause", "turn it up"
- 🎵 **Radio Stations** — 29 curated stations (SomaFM, iHeart) with category browsing
- 🎶 **Spotify Integration** — Search artists/tracks and play to any speaker
- 🔊 **Volume Control** — Per-speaker or whole-house adjustments
- 🏠 **Multi-Room Audio** — Group speakers, control independently, ungroup
- 💾 **Favorites** — Quick access to saved stations
- 📱 **Mobile-First UI** — Responsive design, works on phones and tablets

## How It Works: TypeSafe + Jev

### The Natural Language Pipeline

1. **User speaks**: "Play some funk on the living room speaker"

2. **Jev evaluates** (one TypeSafe API call):
   - What **category** is this? (audio_command, device_command, scene, query, etc.)
   - What **audio action**? (play, pause, play_station, play_spotify, volume_up, etc.)
   - Which **zone**? (Living Room, Kitchen, etc.)
   - What **station** or **search query**?
   - Alternative interpretations with confidence scores

3. **Backend routes** the top answer:
   - Extract the reasoning from Jev's response
   - Call `resolveCommand()` to map answers → device actions
   - Execute via Sonos SOAP protocol or Spotify API

4. **Sonos speaker** receives the command via direct IP over UPnP/SOAP

5. **UI updates** with the result

### Code Flow

```typescript
// server/index.ts - receives voice transcript
const transcript = "play funk on the living room speaker";
const response = await systemOne(transcript, buildQuestions(home, zones));

// server/resolve.ts - routes based on Jev's answers
const resolution = resolveCommand(transcript, home, zones, response);
await sonosGateway.apply(resolution.audioActions);

// server/sonos-direct.ts - talks directly to speaker
await playRadioDirect(zoneId, streamUrl, stationName);
await sonosGateway.setVolume(zoneId, 30);
```

## Quick Setup

### Prerequisites
- Node.js 20+
- Sonos speaker(s) on your WiFi
- TypeSafe API key (for voice, optional)
- Spotify credentials (optional)

### 3-Minute Setup

1. **Clone:**
   ```bash
   git clone https://github.com/haaldinger/typesafe-homeautomation.git
   cd typesafe-homeautomation
   npm install
   ```

2. **Configure `.env`:**
   ```
   SONOS_HOSTS=192.168.1.125
   SONOS_MODE=direct
   TYPESAFE_API_KEY=sk-***          # For voice commands
   SPOTIFY_CLIENT_ID=***            # For Spotify search
   SPOTIFY_CLIENT_SECRET=***
   ```

3. **Run:**
   ```bash
   npm run dev
   ```

4. **Open:** `http://localhost:5173`

## Using the App

### Voice Commands
- Click 🎤, grant microphone permission
- Say: "Play jazz", "pause", "next track", "volume up", "group all speakers"
- Jev parses intent and routes to the right speaker

### Radio Tab
- Browse 29 stations by category (SomaFM, iHeart Baltimore/New York, etc.)
- Click to play instantly

### Search Tab
- Type artist/track name
- Results from Spotify Web API
- Click **Play** to start on selected speaker

### Multi-Room
- **Group** tab: Combine speakers into a group
- **Ungroup**: Split them back
- **Zone cards** show which speakers are grouped together

## Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Backend** | Express.js + TypeSafe SDK |
| **NLU** | TypeSafe System One (Jev model) |
| **Sonos Control** | Direct SOAP/UPnP protocol over IP |
| **Spotify** | Web API integration |
| **Deployment** | Node.js 20+ |

## File Structure

```
server/
├── index.ts              # Express server, API routes
├── typesafe.ts          # TypeSafe question schemas (Jev integration)
├── resolve.ts           # Maps Jev answers → device actions
├── sonos-direct.ts      # Direct SOAP calls to Sonos speakers
├── sonos.ts             # Gateway abstraction (direct/mock modes)
├── spotify.ts           # Spotify Web API wrapper
├── stations.ts          # 29 radio stations database
├── llm.ts               # LLM fallback for voice
└── gateway.ts           # Device gateway interface

src/
├── App.tsx              # Main React component
├── api.ts               # Frontend API client
├── components/
│   ├── ZoneDetail.tsx   # Zone control UI (radio, voice, search)
│   ├── ZoneCard.tsx     # Zone selector
│   ├── Inspector.tsx    # Jev response visualization
│   └── ...
└── index.css            # Responsive styles

shared/
└── types.ts             # Shared TypeScript types (AudioAction, etc.)
```

## How TypeSafe (Jev) Works Here

### One Call, Multiple Questions

Instead of building a state machine or if-else tree, we send **one request to Jev** with ~6 questions:

```typescript
const questions = {
  category: "Is this audio_command, device_command, scene, or query?",
  audio_action: "What audio action? (play, pause, play_station, volume_up, etc.)",
  audio_zone: "Which zone? (living_room, kitchen, etc.)",
  station: "Which radio station, if any?",
  search_query: "What to search for on Spotify?",
  volume_level: "Volume: quiet, medium, loud?",
};

const response = await typeafeClient.askSystemOne(transcript, questions);
```

Jev answers **all questions at once**, with probability distributions and confidence scores. Then we:
1. Check which answer is relevant (e.g., if `audio_action === "play_station"`, we use the `station` answer)
2. Route to the right backend logic
3. Execute on the speaker

### Why This Matters

- **Robust**: Handles variations ("play me some jazz", "start that funk station", "get some funk going")
- **Contextual**: Understands multi-room ("play in the kitchen", "pause all speakers")
- **Composable**: Same Jev call powers radio, Spotify, voice, and manual UI clicks
- **Inspectable**: The Inspector shows what Jev "thought" about each question

## API Endpoints

**Audio Control:**
- `POST /api/zone-control` — Play, pause, volume, group, ungroup
- `POST /api/radio/play` — Start a radio station by URL + name
- `POST /api/spotify/play` — Play Spotify track by URI

**Discovery:**
- `GET /api/zones` — List all speakers and their state
- `GET /api/stations` — All 29 radio stations
- `POST /api/radio/search` — Search Radio Browser API

**Voice:**
- `POST /api/voice` — Send transcript, get Jev response + routing

**Metadata:**
- `GET /api/health` — System status (Sonos mode, Spotify linked, etc.)
- `GET /api/favorites` — Saved Sonos favorites

## Environment Variables

```bash
# Sonos
SONOS_HOSTS=192.168.1.125,192.168.1.126  # Speaker IPs (comma-separated)
SONOS_MODE=direct                          # direct or mock

# TypeSafe (for voice)
TYPESAFE_API_KEY=sk-***                    # Get from typesafe.ai

# Spotify (for search + playback)
SPOTIFY_CLIENT_ID=***
SPOTIFY_CLIENT_SECRET=***

# Optional
SONOS_API_URL=http://localhost:5005        # If using node-sonos-http-api
```

## Demo / Tech Talk Tips

- **Pre-stage speaker**: Make sure it's on and connected to WiFi
- **Grant permissions**: Browser will ask for microphone access on first 🎤 click
- **Test voice**: Say "Play Groove Salad" — it's distinctive and works well
- **Show multi-room**: If you have 2+ speakers, group them and show ungrouping
- **Highlight Jev**: Open Inspector to show the decision trace — the confidence scores and which answers Jev actually used

## Known Limitations

- ❌ **EQ Controls** — Bass/treble not supported on all speaker models (hardware limitation)
- ❌ **Voice Spotify** — Currently doesn't recognize artist names in voice commands (TODO)
- ⚠️ **Real-time sync** — UI may lag behind speaker state if controlled externally
- ⚠️ **Offline mode** — Requires live connection to speakers and Spotify API

## Next Steps / TODO

- [ ] Voice commands for Spotify ("play taylor swift on the kitchen speaker")
- [ ] Real-time UI updates from speaker state (polling)
- [ ] EQ control support (for compatible speakers)
- [ ] Track progress bar with elapsed/duration
- [ ] Playback history / recently played
- [ ] Custom station creation
- [ ] Alarm / scheduled playback
- [ ] Multi-language voice support

## Development

```bash
npm install
npm run dev          # Starts both backend (8787) and frontend (5173)
npm run build        # Build for production
npx tsc --noEmit     # Type check
```

**Backend**: Uses tsx for TypeScript execution  
**Frontend**: Vite for fast HMR development  
**Sonos**: Direct SOAP over IP (no intermediary API required)

## Learn More

- **TypeSafe docs**: https://docs.typesafe.ai
- **Sonos UPnP**: https://developer.sonos.com
- **Spotify Web API**: https://developer.spotify.com
