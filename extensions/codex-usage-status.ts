import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type UsageWindow = {
	used_percent?: number | null;
	reset_after_seconds?: number | null;
	reset_at?: number | null;
};

type RateLimitBucket = {
	allowed?: boolean;
	limit_reached?: boolean;
	primary_window?: UsageWindow | null;
	secondary_window?: UsageWindow | null;
};

type CodexUsageResponse = {
	rate_limit?: RateLimitBucket | null;
	code_review_rate_limit?: RateLimitBucket | null;
	additional_rate_limits?: Record<string, unknown> | unknown[] | null;
	[key: string]: unknown;
};

type UsageSnapshot = {
	fiveHourLeftPercent: number | null;
	sevenDayLeftPercent: number | null;
	sevenDayResetInSeconds: number | null;
	isLimited: boolean;
};

type PercentDisplayMode = "left" | "used";

const EXTENSION_ID = "codex-usage";
const AUTH_FILE = path.join(os.homedir(), ".pi", "agent", "auth.json");
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const SPARK_USAGE_URL = "https://chatgpt.com/api/codex/usage";
const REFRESH_INTERVAL_MS = 60_000;

const CODEX_LABEL = "Codex";
const CODEX_SPARK_LABEL = "Codex Spark";
const SPARK_MODEL_ID = "gpt-5.3-codex-spark";
const FIVE_HOUR_LABEL = "5h:";
const SEVEN_DAY_LABEL = "7d:";
const UNKNOWN_PERCENT = "--";

const DEFAULT_PERCENT_DISPLAY_MODE: PercentDisplayMode = "left";

const MISSING_AUTH_ERROR_PREFIX = "Missing openai-codex OAuth access/accountId";

function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function usedToLeftPercent(value: number | null | undefined): number | null {
	if (typeof value !== "number" || Number.isNaN(value)) return null;
	return clampPercent(100 - value);
}

function leftToUsedPercent(value: number | null | undefined): number | null {
	if (typeof value !== "number" || Number.isNaN(value)) return null;
	return clampPercent(100 - value);
}

function formatPercent(value: number | null | undefined): string | null {
	if (typeof value !== "number" || Number.isNaN(value)) return null;
	return `${Math.round(clampPercent(value))}%`;
}

function formatPercentForMode(valueLeft: number | null, mode: PercentDisplayMode): string | null {
	const displayValue = mode === "left" ? valueLeft : leftToUsedPercent(valueLeft);
	const percentText = formatPercent(displayValue);
	if (!percentText) return null;
	return mode === "left" ? `${percentText} left` : `${percentText} used`;
}

function colorizePercent(
	theme: ExtensionContext["ui"]["theme"],
	valueLeft: number | null,
	mode: PercentDisplayMode,
): string {
	const text = formatPercentForMode(valueLeft, mode);
	if (!text) return theme.fg("muted", UNKNOWN_PERCENT);

	const displayValue = mode === "left" ? valueLeft : leftToUsedPercent(valueLeft);
	if (typeof displayValue !== "number" || Number.isNaN(displayValue)) return theme.fg("muted", UNKNOWN_PERCENT);

	if (mode === "left") {
		if (displayValue <= 10) return theme.fg("error", text);
		if (displayValue <= 25) return theme.fg("warning", text);
		return theme.fg("success", text);
	}

	if (displayValue >= 90) return theme.fg("error", text);
	if (displayValue >= 75) return theme.fg("warning", text);
	return theme.fg("success", text);
}

function formatResetCountdown(seconds: number | null): string | null {
	if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
	const total = Math.max(0, Math.round(seconds));
	const days = Math.floor(total / 86_400);
	const hours = Math.floor((total % 86_400) / 3_600);
	const minutes = Math.floor((total % 3_600) / 60);
	const secs = total % 60;

	if (days > 0) return `${days}d${hours}h`;
	if (hours > 0) return `${hours}h${minutes}m`;
	if (minutes > 0) return `${minutes}m`;
	return `${secs}s`;
}

function isSparkModel(modelId: string | undefined): boolean {
	return modelId === SPARK_MODEL_ID;
}

function getStatusLabel(modelId: string | undefined): string {
	return isSparkModel(modelId) ? CODEX_SPARK_LABEL : CODEX_LABEL;
}

function formatStatus(ctx: ExtensionContext, usage: UsageSnapshot, mode: PercentDisplayMode, modelId: string | undefined): string {
	const theme = ctx.ui.theme;
	const label = getStatusLabel(modelId);
	const title = usage.isLimited ? theme.fg("error", label) : theme.fg("dim", label);
	const fiveHourText = colorizePercent(theme, usage.fiveHourLeftPercent, mode);
	const sevenDayText = colorizePercent(theme, usage.sevenDayLeftPercent, mode);
	const resetText = formatResetCountdown(usage.sevenDayResetInSeconds);
	const sevenDayReset = resetText ? theme.fg("dim", ` (↺${resetText})`) : "";

	return `${title} ${theme.fg("dim", FIVE_HOUR_LABEL)}${fiveHourText} ${theme.fg("dim", SEVEN_DAY_LABEL)}${sevenDayText}${sevenDayReset}`;
}

function parseModeCommandArgument(args: string, currentMode: PercentDisplayMode): PercentDisplayMode | null {
	const token = args.trim().toLowerCase().split(/\s+/)[0] ?? "";
	if (!token || token === "toggle") return currentMode === "left" ? "used" : "left";
	if (token === "left" || token === "used") return token;
	return null;
}

function getModeArgumentCompletions(argumentPrefix: string) {
	const prefix = argumentPrefix.trim().toLowerCase();
	const items = [
		{
			value: "left",
			label: "left",
			description: 'Shows: "Codex 5h:81% left 7d:64% left" (Spark model: "Codex Spark 5h:81% left 7d:64% left")',
		},
		{
			value: "used",
			label: "used",
			description: 'Shows: "Codex 5h:19% used 7d:36% used" (Spark model: "Codex Spark 5h:19% used 7d:36% used")',
		},
		{
			value: "toggle",
			label: "toggle",
			description: 'Flips between "... left" and "... used"',
		},
	];

	if (!prefix) return items;
	const filtered = items.filter((item) => item.value.startsWith(prefix));
	return filtered.length > 0 ? filtered : null;
}

async function loadAuthCredentials(): Promise<{ accessToken: string; accountId: string }> {
	const authRaw = await fs.readFile(AUTH_FILE, "utf8");
	const auth = JSON.parse(authRaw) as Record<
		string,
		| {
				type?: string;
				access?: string | null;
				accountId?: string | null;
				account_id?: string | null;
		  }
		| undefined
	>;

	const codexEntry = auth["openai-codex"];
	const authEntry = codexEntry?.type === "oauth" ? codexEntry : undefined;

	const accessToken = authEntry?.access?.trim();
	const accountId = (authEntry?.accountId ?? authEntry?.account_id)?.trim();

	if (!accessToken || !accountId) {
		throw new Error(`${MISSING_AUTH_ERROR_PREFIX} in ${AUTH_FILE}`);
	}

	return { accessToken, accountId };
}

async function requestUsageJsonFromUrl(
	url: string,
	credentials: { accessToken: string; accountId: string },
): Promise<CodexUsageResponse> {
	const response = await fetch(url, {
		headers: {
			accept: "*/*",
			authorization: `Bearer ${credentials.accessToken}`,
			"chatgpt-account-id": credentials.accountId,
		},
	});

	if (!response.ok) throw new Error(`Codex usage request failed (${response.status}) for ${url}`);
	return (await response.json()) as CodexUsageResponse;
}

async function requestUsageJson(modelId: string | undefined): Promise<CodexUsageResponse> {
	const credentials = await loadAuthCredentials();
	if (isSparkModel(modelId)) {
		return await requestUsageJsonFromUrl(SPARK_USAGE_URL, credentials);
	}
	return await requestUsageJsonFromUrl(USAGE_URL, credentials);
}

function asObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function normalizeRateLimitBucket(value: unknown): RateLimitBucket | null {
	const record = asObject(value);
	if (!record) return null;
	if (!("primary_window" in record || "secondary_window" in record || "limit_reached" in record || "allowed" in record)) {
		return null;
	}
	return record as RateLimitBucket;
}

function matchesSparkIdentifier(value: unknown): boolean {
	if (typeof value !== "string") return false;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return false;
	return normalized === SPARK_MODEL_ID || normalized.includes("spark");
}

function extractSparkRateLimitFromEntry(value: unknown, keyHint?: string): RateLimitBucket | null {
	const record = asObject(value);
	if (!record) return null;

	const idCandidates = [
		keyHint,
		record.model,
		record.model_id,
		record.modelId,
		record.id,
		record.name,
		record.slug,
		record.key,
	];

	const matchesSpark = idCandidates.some((candidate) => matchesSparkIdentifier(candidate));
	if (!matchesSpark) return null;

	return normalizeRateLimitBucket(record.rate_limit) ?? normalizeRateLimitBucket(record);
}

function findSparkRateLimitBucket(data: CodexUsageResponse): RateLimitBucket | null {
	const additional = data.additional_rate_limits;
	if (Array.isArray(additional)) {
		for (const entry of additional) {
			const bucket = extractSparkRateLimitFromEntry(entry);
			if (bucket) return bucket;
		}
	} else {
		const additionalMap = asObject(additional);
		if (additionalMap) {
			for (const [key, value] of Object.entries(additionalMap)) {
				const bucket = extractSparkRateLimitFromEntry(value, key) ?? (matchesSparkIdentifier(key) ? normalizeRateLimitBucket(value) : null);
				if (bucket) return bucket;
			}
		}
	}

	for (const [key, value] of Object.entries(data)) {
		if (!matchesSparkIdentifier(key)) continue;
		const bucket = normalizeRateLimitBucket(value) ?? extractSparkRateLimitFromEntry(value, key);
		if (bucket) return bucket;
	}

	return null;
}

function selectRateLimitBucket(data: CodexUsageResponse, modelId: string | undefined): RateLimitBucket | null {
	if (isSparkModel(modelId)) {
		return findSparkRateLimitBucket(data) ?? normalizeRateLimitBucket(data.rate_limit);
	}
	return normalizeRateLimitBucket(data.rate_limit);
}

function getResetSeconds(window: UsageWindow | null | undefined): number | null {
	const resetAfterSeconds = window?.reset_after_seconds;
	if (typeof resetAfterSeconds === "number" && !Number.isNaN(resetAfterSeconds)) {
		return resetAfterSeconds;
	}

	const resetAt = window?.reset_at;
	if (typeof resetAt !== "number" || Number.isNaN(resetAt)) return null;

	const resetAtSeconds = resetAt > 100_000_000_000 ? resetAt / 1000 : resetAt;
	return Math.max(0, resetAtSeconds - Date.now() / 1000);
}

function parseUsageSnapshot(data: CodexUsageResponse, modelId: string | undefined): UsageSnapshot {
	const selectedBucket = selectRateLimitBucket(data, modelId);
	const fiveHourValue = selectedBucket?.primary_window?.used_percent;
	const sevenDayWindow = selectedBucket?.secondary_window;
	const sevenDayValue = sevenDayWindow?.used_percent;

	return {
		fiveHourLeftPercent: usedToLeftPercent(fiveHourValue),
		sevenDayLeftPercent: usedToLeftPercent(sevenDayValue),
		sevenDayResetInSeconds: getResetSeconds(sevenDayWindow),
		isLimited: selectedBucket?.limit_reached === true || selectedBucket?.allowed === false,
	};
}

async function fetchUsageSnapshot(modelId: string | undefined): Promise<UsageSnapshot> {
	const data = await requestUsageJson(modelId);
	return parseUsageSnapshot(data, modelId);
}

function isMissingCodexAuthError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if (error.message.includes(MISSING_AUTH_ERROR_PREFIX)) return true;

	const errorWithCode = error as Error & { code?: string };
	return errorWithCode.code === "ENOENT" && error.message.includes(AUTH_FILE);
}

function createStatusRefresher() {
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let activeContext: ExtensionContext | undefined;
	let isRefreshInFlight = false;
	let queuedRefresh: { ctx: ExtensionContext; modelId: string | undefined } | null = null;
	let percentDisplayMode: PercentDisplayMode = DEFAULT_PERCENT_DISPLAY_MODE;
	let lastUsageSnapshot: UsageSnapshot | undefined;

	async function updateFooterStatus(ctx: ExtensionContext, modelId = ctx.model?.id): Promise<void> {
		if (!ctx.hasUI) return;
		if (isRefreshInFlight) {
			queuedRefresh = { ctx, modelId };
			return;
		}
		isRefreshInFlight = true;
		try {
			const usage = await fetchUsageSnapshot(modelId);
			lastUsageSnapshot = usage;
			ctx.ui.setStatus(EXTENSION_ID, formatStatus(ctx, usage, percentDisplayMode, modelId));
		} catch (error) {
			if (isMissingCodexAuthError(error)) {
				lastUsageSnapshot = undefined;
				ctx.ui.setStatus(EXTENSION_ID, undefined);
				return;
			}

			const theme = ctx.ui.theme;
			const unavailableStatus = `${getStatusLabel(modelId)} unavailable`;
			ctx.ui.setStatus(EXTENSION_ID, theme.fg("warning", unavailableStatus));
		} finally {
			isRefreshInFlight = false;
			if (queuedRefresh) {
				const nextRefresh = queuedRefresh;
				queuedRefresh = null;
				void updateFooterStatus(nextRefresh.ctx, nextRefresh.modelId);
			}
		}
	}

	async function refreshFor(ctx: ExtensionContext, modelId = ctx.model?.id): Promise<void> {
		activeContext = ctx;
		await updateFooterStatus(ctx, modelId);
	}

	function startAutoRefresh(): void {
		if (refreshTimer) clearInterval(refreshTimer);
		refreshTimer = setInterval(() => {
			if (!activeContext) return;
			void updateFooterStatus(activeContext);
		}, REFRESH_INTERVAL_MS);
		refreshTimer.unref?.();
	}

	function stopAutoRefresh(ctx?: ExtensionContext): void {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = undefined;
		}
		ctx?.ui.setStatus(EXTENSION_ID, undefined);
	}

	async function setLoadingStatus(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) return;

		try {
			await loadAuthCredentials();
		} catch (error) {
			if (isMissingCodexAuthError(error)) {
				ctx.ui.setStatus(EXTENSION_ID, undefined);
				return;
			}
		}

		const loadingStatus = `${getStatusLabel(ctx.model?.id)} loading...`;
		ctx.ui.setStatus(EXTENSION_ID, ctx.ui.theme.fg("dim", loadingStatus));
	}

	function setPercentDisplayMode(mode: PercentDisplayMode): void {
		percentDisplayMode = mode;
	}

	function getPercentDisplayMode(): PercentDisplayMode {
		return percentDisplayMode;
	}

	function renderFromLastSnapshot(ctx: ExtensionContext): boolean {
		if (!ctx.hasUI || !lastUsageSnapshot) return false;
		ctx.ui.setStatus(EXTENSION_ID, formatStatus(ctx, lastUsageSnapshot, percentDisplayMode, ctx.model?.id));
		return true;
	}

	return {
		refreshFor,
		startAutoRefresh,
		stopAutoRefresh,
		setLoadingStatus,
		setPercentDisplayMode,
		getPercentDisplayMode,
		renderFromLastSnapshot,
	};
}

export default function (pi: ExtensionAPI) {
	const refresher = createStatusRefresher();

	function registerRefreshEvent(eventName: "turn_end" | "session_switch"): void {
		pi.on(eventName, (_event, ctx) => {
			void refresher.refreshFor(ctx);
		});
	}

	pi.on("session_start", (_event, ctx) => {
		void refresher.setLoadingStatus(ctx).then(() => refresher.refreshFor(ctx));
		refresher.startAutoRefresh();
	});

	registerRefreshEvent("turn_end");
	registerRefreshEvent("session_switch");
	pi.on("model_select", (event, ctx) => {
		void refresher.refreshFor(ctx, event.model.id);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		refresher.stopAutoRefresh(ctx);
	});

	pi.registerCommand("codex-usage-refresh", {
		description: "Refresh ChatGPT Codex usage footer status",
		handler: async (_args, ctx) => {
			await refresher.refreshFor(ctx);
		},
	});

	pi.registerCommand("codex-usage-mode", {
		description: "Toggle Codex usage display mode, or set it explicitly: left | used",
		getArgumentCompletions: (argumentPrefix) => getModeArgumentCompletions(argumentPrefix),
		handler: async (args, ctx) => {
			const nextMode = parseModeCommandArgument(args, refresher.getPercentDisplayMode());
			if (!nextMode) return;

			refresher.setPercentDisplayMode(nextMode);
			if (!refresher.renderFromLastSnapshot(ctx)) {
				await refresher.refreshFor(ctx);
			}
		},
	});
}
