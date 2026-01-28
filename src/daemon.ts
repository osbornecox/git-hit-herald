/**
 * Built-in scheduler daemon for HypeSeeker
 * Runs update pipeline at configured times — works on all platforms (macOS, Linux, Windows)
 *
 * Usage: npm run daemon
 */

import type { Config } from "./types";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

// Load .env file
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
	const envContent = fs.readFileSync(envPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#")) {
			const [key, ...valueParts] = trimmed.split("=");
			if (key && valueParts.length > 0) {
				process.env[key.trim()] = valueParts.join("=").trim();
			}
		}
	}
}

function loadConfig(): Config {
	const configPath = path.join(process.cwd(), "config", "config.yaml");
	const content = fs.readFileSync(configPath, "utf-8");
	return yaml.parse(content) as Config;
}

function parseTime(timeStr: string): { hours: number; minutes: number } | null {
	const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = parseInt(match[1], 10);
	const minutes = parseInt(match[2], 10);
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return { hours, minutes };
}

function getNextRunTime(times: string[], timezone?: string): Date {
	const now = new Date();

	// Get current time in target timezone
	const nowInTz = timezone
		? new Date(now.toLocaleString("en-US", { timeZone: timezone }))
		: now;

	const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();

	// Parse all times and find next one
	const parsedTimes = times
		.map(parseTime)
		.filter((t): t is { hours: number; minutes: number } => t !== null)
		.map((t) => t.hours * 60 + t.minutes)
		.sort((a, b) => a - b);

	if (parsedTimes.length === 0) {
		throw new Error("No valid times configured in schedule.times");
	}

	// Find next time today or first time tomorrow
	let nextTimeMinutes = parsedTimes.find((t) => t > currentMinutes);
	let daysToAdd = 0;

	if (nextTimeMinutes === undefined) {
		// All times have passed today, use first time tomorrow
		nextTimeMinutes = parsedTimes[0];
		daysToAdd = 1;
	}

	// Create next run date
	const nextRun = new Date(nowInTz);
	nextRun.setDate(nextRun.getDate() + daysToAdd);
	nextRun.setHours(Math.floor(nextTimeMinutes / 60), nextTimeMinutes % 60, 0, 0);

	// If timezone specified, adjust back to local time
	if (timezone) {
		// Calculate offset between target timezone and local
		const localNow = new Date();
		const tzNow = new Date(localNow.toLocaleString("en-US", { timeZone: timezone }));
		const offsetMs = localNow.getTime() - tzNow.getTime();
		nextRun.setTime(nextRun.getTime() + offsetMs);
	}

	return nextRun;
}

function formatDuration(ms: number): string {
	const hours = Math.floor(ms / (1000 * 60 * 60));
	const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

async function runUpdate(): Promise<void> {
	console.log("\n" + "=".repeat(50));
	console.log(`[${new Date().toISOString()}] Starting scheduled update...`);
	console.log("=".repeat(50));

	try {
		// Dynamic import to avoid circular dependencies
		const { updateContentLocal } = await import("./scheduled-local");
		await updateContentLocal();
	} catch (error) {
		console.error("Update failed:", error);
	}
}

async function main(): Promise<void> {
	const config = loadConfig();

	if (!config.schedule?.enabled) {
		console.error("Error: schedule.enabled is not set to true in config.yaml");
		console.error("Either set schedule.enabled: true, or use 'npm run update' for manual runs");
		process.exit(1);
	}

	const { times, timezone } = config.schedule;

	if (!times || times.length === 0) {
		console.error("Error: schedule.times is empty in config.yaml");
		process.exit(1);
	}

	console.log("=".repeat(50));
	console.log("HypeSeeker Daemon Started");
	console.log("=".repeat(50));
	console.log(`Scheduled times: ${times.join(", ")}`);
	console.log(`Timezone: ${timezone || "system default"}`);
	console.log("\nPress Ctrl+C to stop\n");

	// Run immediately on start if --run-now flag
	if (process.argv.includes("--run-now")) {
		await runUpdate();
	}

	// Schedule loop
	const scheduleNext = (): void => {
		const nextRun = getNextRunTime(times, timezone);
		const msUntilNext = nextRun.getTime() - Date.now();

		console.log(
			`Next update: ${nextRun.toLocaleString()} (in ${formatDuration(msUntilNext)})`
		);

		setTimeout(async () => {
			await runUpdate();
			scheduleNext(); // Schedule next run after completion
		}, msUntilNext);
	};

	scheduleNext();

	// Keep process alive
	process.on("SIGINT", () => {
		console.log("\nDaemon stopped");
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		console.log("\nDaemon stopped");
		process.exit(0);
	});
}

main().catch((err) => {
	console.error("Daemon failed:", err);
	process.exit(1);
});
