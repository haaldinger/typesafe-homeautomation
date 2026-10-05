import assert from "node:assert/strict";
import test from "node:test";
import { OpenSkyClient } from "./opensky.ts";

const box = { lamin: 40, lomin: -77, lamax: 41, lomax: -76 };

test("reuses an unexpired OpenSky token", async () => {
	let tokenCalls = 0;
	let stateCalls = 0;
	const client = new OpenSkyClient({
		clientId: "id",
		clientSecret: "secret",
		request: async (url) => {
			if (url.includes("token")) {
				tokenCalls += 1;
				return { status: 200, json: async () => ({ access_token: "token", expires_in: 1800 }) };
			}
			stateCalls += 1;
			return { status: 200, json: async () => ({ time: 1, states: [] }) };
		},
	});

	await client.fetchStates(box);
	await client.fetchStates(box);

	assert.equal(tokenCalls, 1);
	assert.equal(stateCalls, 2);
});

test("refreshes the token once and retries states after a 401", async () => {
	const requests: Array<{ url: string; authorization?: string }> = [];
	let tokenCalls = 0;
	let stateCalls = 0;
	const client = new OpenSkyClient({
		clientId: "id",
		clientSecret: "secret",
		request: async (url, init) => {
			if (url.includes("token")) {
				tokenCalls += 1;
				return {
					status: 200,
					json: async () => ({ access_token: `token-${tokenCalls}`, expires_in: 1800 }),
				};
			}
			stateCalls += 1;
			requests.push({
				url,
				authorization: (init?.headers as Record<string, string> | undefined)?.Authorization,
			});
			return stateCalls === 1
				? { status: 401, json: async () => ({ error: "expired" }) }
				: { status: 200, json: async () => ({ time: 1, states: [] }) };
		},
	});

	await client.fetchStates(box);

	assert.equal(tokenCalls, 2);
	assert.equal(stateCalls, 2);
	assert.deepEqual(requests.map((request) => request.authorization), ["Bearer token-1", "Bearer token-2"]);
	assert.match(requests[0].url, /\/states\/all\?lamin=40&lomin=-77&lamax=41&lomax=-76$/);
});

test("throws a descriptive error for a non-successful token response", async () => {
	const client = new OpenSkyClient({
		clientId: "id",
		clientSecret: "secret",
		request: async () => ({ status: 500, json: async () => ({ error: "unavailable" }) }),
	});

	await assert.rejects(
		client.fetchStates(box),
		(error: Error) => error.message === "OpenSky token request failed with HTTP 500: unavailable",
	);
});
