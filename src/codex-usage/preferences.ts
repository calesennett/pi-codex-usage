import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { asObject, DEFAULT_USAGE_MODE, type JsonObject, type PercentMode } from "./domain";

export const SETTINGS_KEY = "pi-codex-usage";

const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), ".pi", "agent");
export const AUTH_FILE = path.join(agentDir, "auth.json");
export const SETTINGS_FILE = path.join(agentDir, "settings.json");

export async function readJsonObject(file: string): Promise<JsonObject> {
	try {
		return asObject(JSON.parse(await fs.readFile(file, "utf8"))) ?? {};
	} catch (error) {
		if (asObject(error)?.code === "ENOENT") return {};
		throw error;
	}
}

async function writeJson(file: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function loadUsageMode(): Promise<PercentMode> {
	const usageMode = asObject((await readJsonObject(SETTINGS_FILE))[SETTINGS_KEY])?.usageMode;
	return usageMode === "left" || usageMode === "used" ? usageMode : DEFAULT_USAGE_MODE;
}

export async function saveUsageMode(usageMode: PercentMode): Promise<void> {
	const settings = await readJsonObject(SETTINGS_FILE);
	settings[SETTINGS_KEY] = { usageMode };
	await writeJson(SETTINGS_FILE, settings);
}
