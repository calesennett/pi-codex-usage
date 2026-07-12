import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SPARK_MODEL_ID, type PercentMode, type Theme, type UsageSnapshot } from "./domain";

function modelLabel(modelId: string | undefined): string {
	return modelId === SPARK_MODEL_ID ? "Codex Spark" : "Codex";
}

function formatPercent(theme: Theme, leftPercent: number | null, mode: PercentMode): string {
	if (leftPercent === null) return theme.fg("muted", "--");

	const color = leftPercent <= 10 ? "error" : leftPercent <= 25 ? "warning" : "success";
	const displayed = mode === "left" ? leftPercent : 100 - leftPercent;
	return theme.fg(color, `${Math.round(displayed)}% ${mode}`);
}

function formatCountdown(seconds: number | null): string | null {
	if (seconds === null || Number.isNaN(seconds)) return null;

	const total = Math.max(0, Math.round(seconds));
	const days = Math.floor(total / 86_400);
	const hours = Math.floor((total % 86_400) / 3_600);
	const minutes = Math.floor((total % 3_600) / 60);

	if (days) return `${days}d${hours}h`;
	if (hours) return `${hours}h${minutes}m`;
	return minutes ? `${minutes}m` : `${total % 60}s`;
}

export function formatStatus(ctx: ExtensionContext, usage: UsageSnapshot, usageMode: PercentMode, modelId: string | undefined): string {
	const theme = ctx.ui.theme;
	const title = theme.fg(usage.isLimited ? "error" : "dim", modelLabel(modelId));
	const usageText = `${theme.fg("dim", "7d:")}${formatPercent(theme, usage.leftPercent, usageMode)}`;
	const reset = formatCountdown(usage.resetInSeconds);
	const resetText = reset ? theme.fg("dim", ` (↺${reset})`) : "";
	return `${title} ${usageText}${resetText}`;
}

export function unavailableStatus(ctx: ExtensionContext, modelId: string | undefined): string {
	return ctx.ui.theme.fg("warning", `${modelLabel(modelId)} unavailable`);
}
