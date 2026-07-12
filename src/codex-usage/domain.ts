import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type JsonObject = Record<string, unknown>;
export type PercentMode = "left" | "used";
export type Theme = ExtensionContext["ui"]["theme"];

export type UsageWindow = {
	used_percent?: number | null;
	reset_after_seconds?: number | null;
	reset_at?: number | null;
};

export type RateLimitBucket = {
	allowed?: boolean;
	limit_reached?: boolean;
	primary_window?: UsageWindow | null;
};

export type UsageSnapshot = {
	leftPercent: number | null;
	resetInSeconds: number | null;
	isLimited: boolean;
};

export const DEFAULT_USAGE_MODE: PercentMode = "left";
export const SPARK_MODEL_ID = "gpt-5.3-codex-spark";

export function asObject(value: unknown): JsonObject | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
