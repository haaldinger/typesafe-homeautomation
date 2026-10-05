import type { FlightResponse, NearbyAircraft } from "../shared/types.ts";
import { isDemo } from "./profile.ts";

export const LNS_AIRPORT = {
  code: "LNS",
  name: "Lancaster Airport",
  latitude: 40.1217,
  longitude: -76.2961,
};

const DEMO_AIRCRAFT: NearbyAircraft[] = [
  {
    id: "demo-aal1842",
    callsign: "AAL1842",
    flightNumber: "AA1842",
    operator: "American Airlines",
    type: "Boeing 737-800",
    latitude: 40.181,
    longitude: -76.219,
    altitudeFeet: 28400,
    speedKnots: 462,
    heading: 215,
    origin: "BOS",
    destination: "CLT",
    distanceNm: 6.8,
    bearingDeg: 288,
    lastSeen: "2026-09-24T22:00:00.000Z",
  },
  {
    id: "demo-swa812",
    callsign: "SWA812",
    flightNumber: "WN812",
    operator: "Southwest Airlines",
    type: "Boeing 737 MAX 8",
    latitude: 40.244,
    longitude: -76.155,
    altitudeFeet: 19800,
    speedKnots: 395,
    heading: 295,
    origin: "PHL",
    destination: "ORD",
    distanceNm: 10.4,
    bearingDeg: 38,
    lastSeen: "2026-09-24T22:00:00.000Z",
  },
  {
    id: "demo-n482tx",
    callsign: "N482TX",
    operator: "Private Aviation",
    type: "Cirrus SR22",
    latitude: 40.073,
    longitude: -76.226,
    altitudeFeet: 4200,
    speedKnots: 168,
    heading: 238,
    origin: "LNS",
    destination: "HGR",
    distanceNm: 9.1,
    bearingDeg: 142,
    lastSeen: "2026-09-24T22:00:00.000Z",
  },
];

export interface FlightProvider {
  getFlights(): Promise<FlightResponse>;
}

const demoProvider: FlightProvider = {
  async getFlights() {
    return {
      airport: LNS_AIRPORT.code,
      airportName: LNS_AIRPORT.name,
      updatedAt: new Date().toISOString(),
      stale: false,
      source: "demo",
      aircraft: DEMO_AIRCRAFT.map((aircraft) => ({ ...aircraft })),
    };
  },
};

const unavailableProvider: FlightProvider = {
  async getFlights() {
    return {
      airport: LNS_AIRPORT.code,
      airportName: LNS_AIRPORT.name,
      updatedAt: new Date().toISOString(),
      stale: true,
      source: "unavailable",
      aircraft: [],
    };
  },
};

export async function getDemoFlights(): Promise<FlightResponse> {
  return demoProvider.getFlights();
}

export async function getFlights(): Promise<FlightResponse> {
  const provider = isDemo() || (process.env.FLIGHT_PROVIDER ?? "unavailable").toLowerCase() === "demo"
    ? demoProvider
    : unavailableProvider;
  return provider.getFlights();
}
