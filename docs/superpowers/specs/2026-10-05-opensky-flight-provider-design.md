# OpenSky Flight Provider Design

## Goal

Replace Aura's unavailable flight provider with a live OpenSky-backed provider for the LNS wall-panel radar while preserving demo mode and the existing `FlightResponse` contract.

## Scope

This slice covers live state vectors, normalization, caching, freshness, OAuth2 client-credential authentication, and configuration. It does not add a local RTL-SDR receiver, route enrichment, airline lookup, or historical analytics.

## Architecture

```text
OpenSky REST API
  -> server/opensky.ts
    -> cached normalized FlightResponse
      -> GET /api/flights
        -> WallPanelShell Flights view
```

`server/flights.ts` remains the provider selector and public domain boundary. The provider interface will change from synchronous to `getFlights(): Promise<FlightResponse>` so demo, unavailable, and OpenSky providers share one honest contract. The public `/api/flights` route will await the provider while preserving its JSON response shape.

## Configuration

Add server-side environment variables:

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

The default provider remains `unavailable` outside demo mode unless explicitly configured. OpenSky credentials never reach the browser.

## OpenSky Client

The client will:

- Request OAuth2 tokens from the official OpenSky auth endpoint.
- Cache a token until shortly before expiry.
- Request `/api/states/all` with a calculated WGS84 bounding box.
- Include the bearer token when configured.
- Bound request time with an abort timeout.
- Preserve the last successful response when a later request fails.
- Return an unavailable/stale response when no successful response exists.

The polling/cache layer will prevent every browser refresh from consuming API credits. Concurrent requests during an in-flight refresh share the same promise.

## Normalization

For each state vector with valid latitude and longitude:

- `id`: stable `icao24`-based identifier.
- `callsign`: trimmed callsign, falling back to the ICAO24 address.
- `latitude` and `longitude`: source values.
- `altitudeFeet`: barometric altitude meters converted to feet when present.
- `speedKnots`: velocity meters per second converted to knots when present.
- `heading`: true track when present.
- `lastSeen`: OpenSky last-contact timestamp converted to ISO.
- `distanceNm` and `bearingDeg`: calculated from the configured home coordinate.
- `operator`, `type`, `origin`, and `destination`: omitted unless a later enrichment provider supplies them.

Aircraft on the ground will be retained only when they are inside the configured radius and have valid coordinates. Null source fields remain null/omitted rather than fabricated.

## Freshness and failure states

- Fresh successful data: `source: "opensky"`, `stale: false`.
- Cached data after the freshness threshold: `source: "opensky"`, `stale: true`.
- No successful data or invalid configuration: `source: "unavailable"`, `stale: true`, empty aircraft list.
- HTTP 401: refresh the token once, retry the request once, then surface stale/unavailable state.
- HTTP 429 or network timeout: retain cached data and expose stale state.
- Malformed rows: skip only the malformed aircraft, not the entire response.

The response retains `airport: "LNS"` and `airportName: "Lancaster Airport"` for the current wall-panel contract. The configured coordinate is the distance/bearing origin and can later be generalized beyond LNS.

## UI behavior

The Flights view will show:

- Aircraft count and provider label.
- Last update time and stale indicator.
- A clear unavailable state when credentials or provider data are missing.
- Aircraft rows using available callsign, distance, altitude, and speed.
- Detail fields that show `Unknown` or `--` for legitimately missing enrichment.

Demo mode continues to use deterministic fixtures and does not call OpenSky.

## Verification

- Unit-test bbox conversion, meters-to-feet, m/s-to-knots, distance, bearing, timestamp normalization, and malformed-row handling.
- Test token reuse and refresh behavior with mocked HTTP responses.
- Test cache reuse, stale transitions, 401 retry, 429 handling, timeout handling, and unavailable configuration.
- Run `npm run build`.
- Verify `/api/flights` in demo mode remains unchanged.
- Verify OpenSky mode with a fixture response and inspect the wall-panel Flights view at narrow portrait and wide desktop dimensions.
- Confirm no OpenSky credentials appear in browser responses or logs.

## Non-goals

- Scraping ADS-B Exchange or OpenSky's public map.
- Presenting commercial schedules, delays, or guaranteed airline/operator data.
- Claiming route/type/operator enrichment when the source did not provide it.
- Replacing a future local receiver integration.
