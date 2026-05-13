import { asObject, SPARK_MODEL_ID, windowNames, windows, type RateLimitBucket, type UsageSnapshot, type UsageWindow } from "./domain";
import { AUTH_FILE, readJsonObject } from "./preferences";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const SPARK_LIMIT_NAME = "GPT-5.3-Codex-Spark";
export const MISSING_AUTH_ERROR = "Missing openai-codex OAuth access/accountId";

type UsageResponse = {
	rate_limit?: unknown;
	additional_rate_limits?: unknown;
};

async function loadAuthCredentials(): Promise<{ accessToken: string; accountId: string }> {
	const auth = await readJsonObject(AUTH_FILE);
	const entry = asObject(auth["openai-codex"]);
	const accessToken = entry?.type === "oauth" && typeof entry.access === "string" ? entry.access.trim() : undefined;
	const rawAccountId = entry?.accountId ?? entry?.account_id;
	const accountId = typeof rawAccountId === "string" ? rawAccountId.trim() : undefined;

	if (!accessToken || !accountId) throw new Error(`${MISSING_AUTH_ERROR} in ${AUTH_FILE}`);
	return { accessToken, accountId };
}

async function requestUsage(): Promise<UsageResponse> {
	const { accessToken, accountId } = await loadAuthCredentials();
	const response = await fetch(USAGE_URL, {
		headers: {
			accept: "*/*",
			authorization: `Bearer ${accessToken}`,
			"chatgpt-account-id": accountId,
		},
	});

	if (!response.ok) throw new Error(`Codex usage request failed (${response.status}) for ${USAGE_URL}`);
	return await response.json() as UsageResponse;
}

function toPercentLeft(used: unknown): number | null {
	return typeof used === "number" && !Number.isNaN(used) ? Math.min(100, Math.max(0, 100 - used)) : null;
}

function resetSeconds(window: UsageWindow | null | undefined): number | null {
	if (typeof window?.reset_after_seconds === "number" && !Number.isNaN(window.reset_after_seconds)) return window.reset_after_seconds;
	if (typeof window?.reset_at !== "number" || Number.isNaN(window.reset_at)) return null;

	const resetAtSeconds = window.reset_at > 100_000_000_000 ? window.reset_at / 1000 : window.reset_at;
	return Math.max(0, resetAtSeconds - Date.now() / 1000);
}

function rateLimitBucket(value: unknown): RateLimitBucket | null {
	const record = asObject(value);
	return record && ("primary_window" in record || "secondary_window" in record || "limit_reached" in record || "allowed" in record)
		? record as RateLimitBucket
		: null;
}

function selectedBucket(data: UsageResponse, modelId: string | undefined): RateLimitBucket | null {
	if (modelId !== SPARK_MODEL_ID) return rateLimitBucket(data.rate_limit);

	const additionalLimits = Array.isArray(data.additional_rate_limits)
		? data.additional_rate_limits
		: Object.values(asObject(data.additional_rate_limits) ?? {});

	for (const value of additionalLimits) {
		const record = asObject(value);
		const bucket = record?.limit_name === SPARK_LIMIT_NAME && rateLimitBucket(record.rate_limit);
		if (bucket) return bucket;
	}
	return null;
}

export async function getUsage(modelId: string | undefined): Promise<UsageSnapshot> {
	const bucket = selectedBucket(await requestUsage(), modelId);
	const snapshot: UsageSnapshot = {
		leftPercent: { "5h": null, "7d": null },
		resetInSeconds: { "5h": null, "7d": null },
		isLimited: bucket?.limit_reached === true || bucket?.allowed === false,
	};

	for (const name of windowNames) {
		const window = bucket?.[windows[name].field];
		snapshot.leftPercent[name] = toPercentLeft(window?.used_percent);
		snapshot.resetInSeconds[name] = resetSeconds(window);
	}
	return snapshot;
}
