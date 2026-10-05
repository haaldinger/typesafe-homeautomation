import assert from "node:assert/strict";
import { getDemoFlights, LNS_AIRPORT } from "./flights.ts";

const response = getDemoFlights();

assert.equal(response.airport, "LNS");
assert.equal(response.airportName, LNS_AIRPORT.name);
assert.equal(response.stale, false);
assert.equal(response.aircraft.length, 3);
assert.ok(response.aircraft.every((aircraft) => aircraft.callsign.length > 0));
assert.ok(response.aircraft.every((aircraft) => aircraft.latitude >= 39 && aircraft.latitude <= 41));
assert.ok(response.aircraft.every((aircraft) => aircraft.longitude >= -78 && aircraft.longitude <= -75));

console.log("flight demo contract passed");
