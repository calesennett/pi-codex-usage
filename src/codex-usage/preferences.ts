import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { asObject, DEFAULT_PREFERENCES, type JsonObject, type Preferences } from "./domain";

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

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
	return typeof value === "string" && (choices as readonly string[]).includes(value);
}

function normalizePreferences(value: unknown): Preferences {
	const settings = asObject(value);
	return {
		usageMode: isOneOf(settings?.usageMode, ["left", "used"] as const) ? settings.usageMode : DEFAULT_PREFERENCES.usageMode,
		refreshWindow: isOneOf(settings?.refreshWindow, ["5h", "7d"] as const) ? settings.refreshWindow : DEFAULT_PREFERENCES.refreshWindow,
	};
}

export async function loadPreferences(): Promise<Preferences> {
	const settings = await readJsonObject(SETTINGS_FILE);
	const preferences = normalizePreferences(settings[SETTINGS_KEY]);
	const persisted = asObject(settings[SETTINGS_KEY]);
	if (!persisted || persisted.usageMode !== preferences.usageMode || persisted.refreshWindow !== preferences.refreshWindow) {
		settings[SETTINGS_KEY] = preferences;
		await writeJson(SETTINGS_FILE, settings);
	}
	return preferences;
}

export async function savePreferences(preferences: Preferences): Promise<void> {
	const settings = await readJsonObject(SETTINGS_FILE);
	settings[SETTINGS_KEY] = preferences;
	await writeJson(SETTINGS_FILE, settings);
}
