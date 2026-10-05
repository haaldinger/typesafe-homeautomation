# OpenSky Flight Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cached, authenticated OpenSky provider that supplies live normalized aircraft data to Aura's existing LNS wall-panel radar.

**Architecture:** Keep `server/flights.ts` as the provider selector and normalization boundary. Add `server/opensky.ts` for OAuth2, bounded-box requests, normalization, and cache state. Make the provider contract asynchronous, preserve demo/unavailable behavior, and expose only normalized `FlightResponse` data to the browser. Keep wall-panel UI changes limited to provider, freshness, and unavailable states.

**Tech Stack:** Node 20+, TypeScript, Express, native `fetch`, Node `node:test`, React 19, Vite, existing `FlightResponse` and `WallPanelShell` components.

---

### Task 1: Make the flight provider contract asynchronous

**Files:**
- Modify: `server/flights.ts`
- Modify: `server/index.ts:326-330`
- Test: `server/flights.test.ts`

- [ ] **Step 1: Add a failing async contract test**

Convert `server/flights.test.ts` to a `node:test` suite, retain the existing demo assertions inside a test, and add a test that awaits the provider-facing function. Set demo mode before module import through the command environment:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { getFlights } from "./flights.ts";

test("getFlights returns a FlightResponse promise in demo mode", async () => {
  const response = await getFlights();
  assert.equal(response.source, "demo");
  assert.equal(response.airport, "LNS");
});
```

- [ ] **Step 2: Run the focused test and confirm the contract failure**

Run:

```bash
AURA_PROFILE=demo node --import tsx --test server/flights.test.ts
```

Expected: the new test fails because `getFlights()` is currently synchronous and the provider interface does not return a promise.

- [ ] **Step 3: Change provider interfaces and route handling**

In `server/flights.ts`, change:

```ts
export interface FlightProvider {
  getFlights(): FlightResponse;
}
```

to:

```ts
export interface FlightProvider {
  getFlights(): Promise<FlightResponse>;
}
```

Make demo and unavailable providers return `Promise.resolve(...)`, and make `getFlights()` async. In `server/index.ts`, change the route to:

```ts
app.get("/api/flights", async (_req, res) => {
  try {
    res.json(await getFlights());
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});
```

- [ ] **Step 4: Run the focused test and build**

Run:

```bash
AURA_PROFILE=demo node --import tsx --test server/flights.test.ts
npm run build
```

Expected: the focused test passes and the build completes successfully.

- [ ] **Step 5: Commit the contract change**

```bash
git add server/flights.ts server/index.ts server/flights.test.ts
git commit -m "Make flight providers asynchronous"
```

### Task 2: Add OpenSky token and HTTP client

**Files:**
- Create: `server/opensky.ts`
- Create: `server/opensky.test.ts`

- [ ] **Step 1: Write failing token and request tests**

Create `server/opensky.test.ts` using `node:test` and a dependency-injected request function. Cover token reuse and token refresh:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { OpenSkyClient } from "./opensky.ts";

test("reuses an unexpired OpenSky token", async () => {
  let tokenCalls = 0;
  const client = new OpenSkyClient({
    clientId: "id",
    clientSecret: "secret",
    request: async (url) => {
      if (url.includes("token")) {
        tokenCalls += 1;
        return { status: 200, json: async () => ({ access_token: "token", expires_in: 1800 }) };
      }
      return { status: 200, json: async () => ({ time: 1, states: [] }) };
    },
  });

  await client.fetchStates({ lamin: 40, lomin: -77, lamax: 41, lomax: -76 });
  await client.fetchStates({ lamin: 40, lomin: -77, lamax: 41, lomax: -76 });
  assert.equal(tokenCalls, 1);
});
```

Add a second test that returns `401` once, then verifies the client refreshes the token and retries exactly once.

- [ ] **Step 2: Run tests and verify the missing module failure**

Run:

```bash
node --import tsx --test server/opensky.test.ts
```

Expected: FAIL because `server/opensky.ts` does not exist.

- [ ] **Step 3: Implement the minimal OpenSky client**

Implement:

```ts
export interface BoundingBox { lamin: number; lomin: number; lamax: number; lomax: number; }
export interface OpenSkyStateResponse { time?: number; states?: unknown[][] | null; }
export interface OpenSkyRequest { status: number; json(): Promise<unknown>; }
export interface OpenSkyClientOptions {
  clientId?: string;
  clientSecret?: string;
  request?: (url: string, init?: RequestInit) => Promise<OpenSkyRequest>;
  now?: () => number;
}
export class OpenSkyClient {
  constructor(options: OpenSkyClientOptions = {}) {}
  async fetchStates(box: BoundingBox): Promise<OpenSkyStateResponse> {}
}
```

Use the official token endpoint `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token` and API root `https://opensky-network.org/api`. Cache the bearer token until 30 seconds before expiry. Use `AbortSignal.timeout(8000)` for network requests. When a states request returns `401`, clear the token, refresh once, and retry once. Throw descriptive errors for non-2xx responses after retry handling.

- [ ] **Step 4: Run the client tests**

Run:

```bash
node --import tsx --test server/opensky.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the client**

```bash
git add server/opensky.ts server/opensky.test.ts
git commit -m "Add authenticated OpenSky client"
```

### Task 3: Normalize state vectors and add cached provider behavior

**Files:**
- Modify: `server/opensky.ts`
- Modify: `server/flights.ts`
- Test: `server/opensky.test.ts`

- [ ] **Step 1: Add failing normalization tests**

Add a fixture row and assert the normalized result:

```ts
test("normalizes an OpenSky state vector", () => {
  const aircraft = normalizeState(
    ["abc123", " AAL1842 ", "United States", 1000, 1001, -76.2, 40.2, 10000, false, 120, 215],
    { latitude: 40.1217, longitude: -76.2961 },
  );
  assert.deepEqual(aircraft, {
    id: "opensky-abc123",
    callsign: "AAL1842",
    latitude: 40.2,
    longitude: -76.2,
    altitudeFeet: 32808,
    speedKnots: 233,
    heading: 215,
    distanceNm: 5.1,
    bearingDeg: 41,
    lastSeen: "1970-01-01T00:16:41.000Z",
  });
});
```

Add tests for missing coordinates, blank callsigns, null altitude/speed, and malformed rows returning `undefined` rather than throwing.

- [ ] **Step 2: Run tests and confirm missing normalization behavior**

Run:

```bash
node --import tsx --test server/opensky.test.ts
```

Expected: FAIL because normalization is not implemented.

- [ ] **Step 3: Implement normalization and geometry helpers**

Add pure functions in `server/opensky.ts`:

```ts
export function normalizeState(row: unknown[], origin: { latitude: number; longitude: number }): NearbyAircraft | undefined {}
export function boundingBox(latitude: number, longitude: number, radiusNm: number): BoundingBox {}
```

Use `1 degree latitude = 60 nautical miles`, longitude width adjusted by cosine of latitude. Use haversine distance and initial bearing. Convert meters to feet with `meters * 3.28084`, meters/second to knots with `* 1.94384`, and round display values to stable integers/tenths.

- [ ] **Step 4: Implement provider cache**

Add an `OpenSkyProvider` with:

```ts
export interface OpenSkyProviderOptions {
  client: OpenSkyClient;
  latitude: number;
  longitude: number;
  radiusNm: number;
  pollMs: number;
  staleMs: number;
  now?: () => number;
}

export class OpenSkyProvider {
  async getFlights(): Promise<FlightResponse> {}
}
```

Cache the last successful `FlightResponse`, cache timestamp, and in-flight refresh promise. Return the cache while it is fresh; share an in-flight refresh; retain stale cache on errors; return unavailable when no cache exists. Filter to valid coordinates and the configured radius. Preserve `airport: "LNS"` and `airportName: "Lancaster Airport"`.

- [ ] **Step 5: Add provider-selection tests**

Test that:

- `FLIGHT_PROVIDER=demo` returns demo data.
- `FLIGHT_PROVIDER=opensky` with missing credentials returns unavailable without making a network call.
- A successful fixture response returns `source: "opensky"` and `stale: false`.
- A later client failure returns the cached result with `stale: true`.
- A first client failure returns `source: "unavailable"` and an empty list.

- [ ] **Step 6: Run focused tests and build**

```bash
node --import tsx --test server/flights.test.ts server/opensky.test.ts
npm run build
```

Expected: all tests pass and the build succeeds.

- [ ] **Step 7: Commit provider behavior**

```bash
git add server/opensky.ts server/opensky.test.ts server/flights.ts shared/types.ts
git commit -m "Add cached OpenSky flight provider"
```

### Task 4: Wire configuration and API freshness states

**Files:**
- Modify: `server/flights.ts`
- Modify: `server/index.ts`
- Modify: `src/api.ts` to preserve the existing `FlightResponse` client type
- Modify: `README.md`

- [ ] **Step 1: Read configuration from environment**

Use numeric parsing with explicit defaults:

```ts
const latitude = Number(process.env.FLIGHT_LATITUDE ?? "40.1217");
const longitude = Number(process.env.FLIGHT_LONGITUDE ?? "-76.2961");
const radiusNm = Number(process.env.FLIGHT_RADIUS_NM ?? "35");
const pollMs = Number(process.env.FLIGHT_POLL_MS ?? "30000");
const staleMs = Number(process.env.FLIGHT_STALE_MS ?? "90000");
```

Reject non-finite or non-positive values by using defaults and log only configuration status, never credentials.

- [ ] **Step 2: Wire provider selection**

Keep demo mode authoritative. Outside demo mode, choose OpenSky only when `FLIGHT_PROVIDER=opensky`; otherwise return the unavailable provider. Instantiate one provider at module scope so its token and cache survive requests.

- [ ] **Step 3: Update README configuration**

Document:

```env
FLIGHT_PROVIDER=opensky
OPENSKY_CLIENT_ID=...
OPENSKY_CLIENT_SECRET=...
FLIGHT_LATITUDE=40.1217
FLIGHT_LONGITUDE=-76.2961
FLIGHT_RADIUS_NM=35
FLIGHT_POLL_MS=30000
FLIGHT_STALE_MS=90000
```

Document that OpenSky is for research/non-commercial use, credentials stay server-side, and demo mode does not call the API.

- [ ] **Step 4: Validate the API contract**

Run:

```bash
npm run build
curl -sS http://localhost:8787/api/flights | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const f=JSON.parse(s); console.log(JSON.stringify({source:f.source,stale:f.stale,count:f.aircraft.length}));})'
```

Expected: in demo mode, `source` is `demo`; with missing OpenSky credentials, `source` is `unavailable` and the request still returns valid JSON.

- [ ] **Step 5: Commit API/configuration work**

```bash
git add server/flights.ts server/index.ts src/api.ts README.md
git commit -m "Wire OpenSky flight configuration"
```

### Task 5: Make the Flights view honest and responsive

**Files:**
- Modify: `src/components/WallPanelShell.tsx`
- Modify: `src/index.css`
- Test: browser checks at 320x568, 768x1024, 1024x768, 1366x900, and a portrait 750x1334 panel viewport

- [ ] **Step 1: Add provider/freshness copy to the Flights view**

Show a compact status line derived from `flights.source`, `flights.updatedAt`, and `flights.stale`:

```tsx
const sourceLabel = flights?.source === "opensky" ? "OpenSky live" : flights?.source === "demo" ? "Demo traffic" : "Provider unavailable";
const freshnessLabel = flights?.stale ? "Stale" : flights ? "Updated" : "Waiting";
```

Keep the aircraft list and detail interaction unchanged. When unavailable, explain that credentials or a provider are not configured. When stale, show the last update time and keep cached rows visible.

- [ ] **Step 2: Add responsive styles**

Use the existing wall-panel classes and add stable grid tracks so the status line, list rows, and detail grid do not overflow on narrow portrait panels. Keep all controls at least 44px high and preserve reduced-motion behavior.

- [ ] **Step 3: Verify browser states**

Check demo, unavailable, and fixture-backed OpenSky states in the browser. Verify no horizontal overflow and that the selected-aircraft detail remains usable in portrait and landscape layouts.

- [ ] **Step 4: Run final validation**

```bash
npm run build
node --import tsx --test server/flights.test.ts server/opensky.test.ts
```

- [ ] **Step 5: Commit the UI slice**

```bash
git add src/components/WallPanelShell.tsx src/index.css
git commit -m "Show OpenSky freshness in Flights view"
```

### Task 6: Final verification and publish

**Files:**
- No source changes expected.

- [ ] **Step 1: Run complete validation**

```bash
npm run build
node --import tsx --test server/flights.test.ts server/opensky.test.ts
```

- [ ] **Step 2: Verify secrets are not tracked**

```bash
git check-ignore .env .env.local .aura-hue.json .aura-profile.json
```

Expected: all local credential files are ignored.

- [ ] **Step 3: Inspect API responses**

Confirm `/api/flights` contains only normalized aircraft data and no client ID, client secret, bearer token, or raw provider credentials.

- [ ] **Step 4: Commit and push the completed provider**

```bash
git status --short --branch
git push origin main
```

Expected: the branch is synchronized with `origin/main` after the push.
