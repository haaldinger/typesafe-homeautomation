# Aura — Smart Home, powered by TypeSafe

A replica of the [TypeSafe smart-home demo](https://docs.typesafe.ai/demos/smart-home).
Type a natural-language command; TypeSafe's System One model (Jev) evaluates a whole
set of questions in **one call** (speculative fan-out), and plain code routes the
answers to device actions. Built for a live meetup walkthrough.

## What it shows

- **Speculative fan-out** — every request runs one TypeSafe call with ~9 questions
  (category, scope, room, device type, action, brightness, temperature, scene,
  is-compound). Code decides which answers are relevant and ignores the rest.
- **TypeSafe + LLM pairing** — compound requests ("dim the lights *and* lock the
  doors") are split by a **local Ollama** model into atomic commands, each
  re-evaluated by TypeSafe. Off-topic requests fall back to a conversational
  Ollama reply. If Ollama is unreachable, the app uses simple heuristics.
- **The Inspector panel** visualizes every answer, its probability distribution,
  confidence, and whether the routing code actually used it — plus latency and
  token usage.

## Device backends

The reasoning layer (TypeSafe fan-out + routing) is identical regardless of what
executes the actions. A `DeviceGateway` ([server/gateway.ts](server/gateway.ts))
is the only seam that changes. Select it with `GATEWAY` in `.env`:

- `GATEWAY=sim` (default) — the built-in simulated home. Reliable for demos.
- `GATEWAY=homeassistant` — reads and drives **real** devices via Home Assistant.

### Connecting Home Assistant

1. In Home Assistant, create a long-lived access token:
   **Profile → Security → Long-lived access tokens → Create token**.
2. Set these in `.env`:
   ```
   GATEWAY=homeassistant
   HASS_URL=http://homeassistant.local:8123   # or your HA IP:port
   HASS_TOKEN=<your long-lived token>
   ```
3. Restart (`npm run dev`). The app discovers every `light`, `lock`, `cover`,
   `climate`, `fan`, and `media_player` entity — grouped by HA **area** — in a
   single templated call, and the TypeSafe room question adapts to your real
   areas automatically. Commands then call HA services (`light.turn_on`,
   `lock.lock`, `cover.set_cover_position`, `climate.set_temperature`, etc.).

The HA token stays server-side, next to the TypeSafe key. (In HA mode, clicking a
device card is optimistic/local; it re-syncs on the next command.)

### Sonos audio (whole-house)

Audio is a first-class domain in the same speculative fan-out — *"play something
on the deck"*, *"turn it up in the kitchen"*, *"group the deck with the living
room"*, and cross-domain compounds like *"play music on the deck and dim the
kitchen"* all route through one Decision Trace. Zones: **Living Room, Kitchen,
Deck**. Configure in `.env`:

```
SONOS_MODE=mock                       # built-in zones, no hardware
# SONOS_MODE=live                     # drive real speakers
SONOS_API_URL=http://localhost:5005   # a running node-sonos-http-api
```

Grouping uses one yes/no judgment per zone (robust multi-zone extraction), and
the zone list is passed into the model state so it grounds on real zones.

## Run it

1. Add your TypeSafe API key to `.env`:
   ```
   TYPESAFE_API_KEY=sk-...
   ```
   The LLM pairing uses a local **Ollama** server. Make sure it's running and the
   model is pulled:
   ```sh
   ollama serve
   ollama pull llama3.1:8b
   ```
   (Set `LLM_PROVIDER=none` in `.env` to skip Ollama and use heuristics only.)

2. Install and start (runs the API proxy + Vite together):
   ```sh
   npm install
   npm run dev
   ```

3. Open http://localhost:5173

The TypeSafe key stays server-side in `server/` and is never exposed to the browser.

## Where the code lives

| Part | File |
| --- | --- |
| Fan-out question set (dynamic per home) | [server/typesafe.ts](server/typesafe.ts) |
| Routing answers → device actions | [server/resolve.ts](server/resolve.ts) |
| Device backends (sim / Home Assistant) | [server/gateway.ts](server/gateway.ts) |
| Home Assistant discovery + service calls | [server/homeassistant.ts](server/homeassistant.ts) |
| LLM split + conversational fallback | [server/llm.ts](server/llm.ts) |
| Orchestration endpoint | [server/index.ts](server/index.ts) |
| Simulated home model | [shared/home.ts](shared/home.ts) |
| UI | [src/App.tsx](src/App.tsx), [src/components/Inspector.tsx](src/components/Inspector.tsx) |
