import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parseUsageMode, usageModeCompletions } from "../src/codex-usage/commands";
import { formatStatus, unavailableStatus } from "../src/codex-usage/format";
import { loadUsageMode, saveUsageMode, SETTINGS_FILE } from "../src/codex-usage/preferences";
import { DEFAULT_USAGE_MODE, errorMessage, type PercentMode, type UsageSnapshot } from "../src/codex-usage/domain";
import { getUsage, MISSING_AUTH_ERROR } from "../src/codex-usage/usage";

const EXTENSION_ID = "codex-usage";
const REFRESH_INTERVAL_MS = 60_000;

class CodexUsageStatus {
	private ctx?: ExtensionContext;
	private generation = 0;
	private timer?: ReturnType<typeof setInterval>;
	private inFlight = false;
	private queued?: { ctx: ExtensionContext; generation: number; modelId?: string };
	private lastUsage?: UsageSnapshot;
	private usageMode: PercentMode = DEFAULT_USAGE_MODE;
	private usageModeRevision = 0;
	private settingsQueue: Promise<void> = Promise.resolve();

	public constructor(private readonly pi: ExtensionAPI) {
		pi.on("session_start", (_event, ctx) => this.start(ctx));
		pi.on("turn_end", (_event, ctx) => void this.refresh(ctx));
		pi.on("model_select", (event, ctx) => void this.refresh(ctx, event.model.id));
		pi.on("session_shutdown", (_event, ctx) => this.stop(ctx));

		this.registerUsageModeCommand();
	}

	private isCurrent(generation: number): boolean {
		return this.ctx !== undefined && this.generation === generation;
	}

	private start(ctx: ExtensionContext): void {
		this.generation++;
		this.ctx = ctx;
		if (this.timer) clearInterval(this.timer);
		this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
		this.timer.unref?.();

		const generation = this.generation;
		void (async () => {
			await this.loadUsageMode(ctx, generation);
			await this.refresh(ctx, ctx.model?.id, generation);
		})();
	}

	private stop(ctx: ExtensionContext): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
		this.queued = undefined;
		this.ctx = undefined;
		this.generation++;
		if (ctx.hasUI) ctx.ui.setStatus(EXTENSION_ID, undefined);
	}

	private enqueueSettingsOperation<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.settingsQueue.then(operation);
		this.settingsQueue = result.then(() => undefined, () => undefined);
		return result;
	}

	private async loadUsageMode(ctx: ExtensionContext, generation: number): Promise<void> {
		const revision = this.usageModeRevision;
		try {
			const usageMode = await this.enqueueSettingsOperation(() => loadUsageMode());
			if (this.isCurrent(generation) && this.usageModeRevision === revision) this.usageMode = usageMode;
		} catch (error) {
			if (!this.isCurrent(generation)) return;
			const changedDuringLoad = this.usageModeRevision !== revision;
			if (!changedDuringLoad) this.usageMode = DEFAULT_USAGE_MODE;
			if (ctx.hasUI) {
				const action = changedDuringLoad ? "keeping current mode" : "using default";
				ctx.ui.notify(`pi-codex-usage: failed to load ${SETTINGS_FILE}, ${action}: ${errorMessage(error)}`, "warning");
			}
		}
	}

	private async refresh(ctx = this.ctx, modelId = ctx?.model?.id, generation = this.generation): Promise<void> {
		if (!ctx?.hasUI || !this.isCurrent(generation)) return;

		if (this.inFlight) {
			this.queued = { ctx, generation, modelId };
			return;
		}

		this.inFlight = true;
		try {
			const usage = await getUsage(modelId);
			if (!this.isCurrent(generation)) return;
			this.lastUsage = usage;
			ctx.ui.setStatus(EXTENSION_ID, formatStatus(ctx, usage, this.usageMode, modelId));
		} catch (error) {
			if (!this.isCurrent(generation)) return;
			if (errorMessage(error).includes(MISSING_AUTH_ERROR)) {
				this.lastUsage = undefined;
				ctx.ui.setStatus(EXTENSION_ID, undefined);
			} else {
				ctx.ui.setStatus(EXTENSION_ID, unavailableStatus(ctx, modelId));
			}
		} finally {
			this.inFlight = false;
			const queued = this.queued;
			this.queued = undefined;
			if (queued && this.isCurrent(queued.generation)) void this.refresh(queued.ctx, queued.modelId, queued.generation);
		}
	}

	private renderLast(ctx: ExtensionContext): boolean {
		if (!ctx.hasUI || !this.lastUsage) return false;
		ctx.ui.setStatus(EXTENSION_ID, formatStatus(ctx, this.lastUsage, this.usageMode, ctx.model?.id));
		return true;
	}

	private saveUsageMode(ctx: ExtensionContext, generation = this.generation): void {
		const usageMode = this.usageMode;
		const result = this.enqueueSettingsOperation(() => saveUsageMode(usageMode));
		void result.catch(error => {
			const notifyContext = this.ctx ?? ctx;
			if (this.isCurrent(generation) && notifyContext.hasUI) {
				notifyContext.ui.notify(`pi-codex-usage: failed to write ${SETTINGS_FILE}: ${errorMessage(error)}`, "warning");
			}
		});
	}

	private registerUsageModeCommand(): void {
		this.pi.registerCommand("codex-usage-mode", {
			description: "Toggle Codex usage display mode, or set it explicitly: left | used",
			getArgumentCompletions: usageModeCompletions,
			handler: async (args, ctx) => {
				const usageMode = parseUsageMode(args, this.usageMode);
				if (!usageMode) return;

				this.usageModeRevision++;
				this.usageMode = usageMode;
				this.saveUsageMode(ctx);
				if (!this.renderLast(ctx)) await this.refresh(ctx);
			},
		});
	}
}

export default function (pi: ExtensionAPI) {
	new CodexUsageStatus(pi);
}
