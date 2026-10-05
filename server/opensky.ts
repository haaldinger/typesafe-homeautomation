const OPEN_SKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPEN_SKY_API_ROOT = "https://opensky-network.org/api";
const TOKEN_REFRESH_BUFFER_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface BoundingBox {
	lamin: number;
	lomin: number;
	lamax: number;
	lomax: number;
}

export interface OpenSkyStateResponse {
	time?: number;
	states?: unknown[][] | null;
}

export interface OpenSkyRequest {
	status: number;
	json(): Promise<unknown>;
}

export interface OpenSkyClientOptions {
	clientId?: string;
	clientSecret?: string;
	request?: (url: string, init?: RequestInit) => Promise<OpenSkyRequest>;
	now?: () => number;
}

interface CachedToken {
	accessToken: string;
	expiresAt: number;
}

const defaultRequest = async (url: string, init?: RequestInit): Promise<OpenSkyRequest> => fetch(url, init);

function responseDescription(body: unknown): string {
	if (typeof body === "string" && body.length > 0) return body;
	if (body && typeof body === "object") {
		const record = body as Record<string, unknown>;
		for (const key of ["error_description", "error", "message"]) {
			if (typeof record[key] === "string" && record[key].length > 0) return record[key];
		}
	}
	return "no response details";
}

export class OpenSkyClient {
	private readonly clientId: string;
	private readonly clientSecret: string;
	private readonly request: (url: string, init?: RequestInit) => Promise<OpenSkyRequest>;
	private readonly now: () => number;
	private cachedToken: CachedToken | undefined;

	constructor(options: OpenSkyClientOptions = {}) {
		this.clientId = options.clientId ?? process.env.OPENSKY_CLIENT_ID ?? "";
		this.clientSecret = options.clientSecret ?? process.env.OPENSKY_CLIENT_SECRET ?? "";
		this.request = options.request ?? defaultRequest;
		this.now = options.now ?? Date.now;
	}

	async fetchStates(box: BoundingBox): Promise<OpenSkyStateResponse> {
		const token = await this.getToken();
		const response = await this.requestStates(box, token);
		if (response.status === 401) {
			this.cachedToken = undefined;
			const refreshedToken = await this.getToken();
			return this.parseStatesResponse(await this.requestStates(box, refreshedToken));
		}
		return this.parseStatesResponse(response);
	}

	private async getToken(): Promise<string> {
		if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS > this.now()) {
			return this.cachedToken.accessToken;
		}
		if (!this.clientId || !this.clientSecret) {
			throw new Error("OpenSky credentials are not configured");
		}

		const response = await this.request(OPEN_SKY_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: this.clientId,
				client_secret: this.clientSecret,
			}).toString(),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		const body = await response.json();
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`OpenSky token request failed with HTTP ${response.status}: ${responseDescription(body)}`);
		}
		if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).access_token !== "string") {
			throw new Error("OpenSky token response did not include an access_token");
		}

		const tokenBody = body as { access_token: string; expires_in?: number };
		this.cachedToken = {
			accessToken: tokenBody.access_token,
			expiresAt: this.now() + (typeof tokenBody.expires_in === "number" ? tokenBody.expires_in * 1000 : 0),
		};
		return tokenBody.access_token;
	}

	private requestStates(box: BoundingBox, token: string): Promise<OpenSkyRequest> {
		const query = new URLSearchParams({
			lamin: String(box.lamin),
			lomin: String(box.lomin),
			lamax: String(box.lamax),
			lomax: String(box.lomax),
		});
		return this.request(`${OPEN_SKY_API_ROOT}/states/all?${query}`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	}

	private async parseStatesResponse(response: OpenSkyRequest): Promise<OpenSkyStateResponse> {
		const body = await response.json();
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`OpenSky states request failed with HTTP ${response.status}: ${responseDescription(body)}`);
		}
		return body as OpenSkyStateResponse;
	}
}
