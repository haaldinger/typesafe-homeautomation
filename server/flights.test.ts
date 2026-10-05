import assert from "node:assert/strict";
import test from "node:test";
import { getDemoFlights, getFlights, LNS_AIRPORT } from "./flights.ts";

test("demo flights preserve the existing response contract", async () => {
	const response = await getDemoFlights();

	assert.equal(response.airport, "LNS");
	assert.equal(response.airportName, LNS_AIRPORT.name);
	assert.equal(response.stale, false);
	assert.equal(response.aircraft.length, 3);
	assert.ok(response.aircraft.every((aircraft) => aircraft.callsign.length > 0));
	assert.ok(response.aircraft.every((aircraft) => aircraft.latitude >= 39 && aircraft.latitude <= 41));
	assert.ok(response.aircraft.every((aircraft) => aircraft.longitude >= -78 && aircraft.longitude <= -75));
});

test("getFlights asynchronously returns demo flights when demo mode is pinned", async () => {
	const pending = getFlights();

	assert.ok(pending instanceof Promise);
	const response = await pending;

	assert.equal(response.source, "demo");
	assert.equal(response.stale, false);
	assert.equal(response.aircraft.length, 3);
});
