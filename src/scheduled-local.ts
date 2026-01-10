import { fetchGitHubPosts, fetchHuggingFacePosts, fetchRedditPosts, fetchReplicatePosts } from "./fetchers";
import { posts as db } from "./db-local";
import { scorePosts } from "./llm/scorer";
import { enrichPosts } from "./llm/enricher";
import type { Post, Config, Env } from "./types";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

function loadConfig(): Config {
	const configPath = path.join(process.cwd(), "config", "config.yaml");
	const content = fs.readFileSync(configPath, "utf-8");
	return yaml.parse(content) as Config;
}

// Minimal env for fetchers that need it (only Replicate uses env)
function createMinimalEnv(): Env {
	return {
		REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || "",
	};
}

export async function updateContentLocal(): Promise<void> {
	console.log("Starting local content update...");
	console.log("=".repeat(50));

	const config = loadConfig();
	const env = createMinimalEnv();
	const date = new Date();
	date.setDate(date.getDate() - 7);
	const lastWeekDate = date.toISOString().slice(0, 10);

	console.log(`Using language: ${config.language}`);

	// 1. Fetch from all sources
	console.log("\n[1/5] Fetching posts from sources...");

	const [huggingFacePosts, gitHubPosts, redditPosts, replicatePosts] = await Promise.all([
		fetchHuggingFacePosts(config.sources).catch((e) => {
			console.error("  HuggingFace fetch failed:", e.message);
			return [] as Post[];
		}),
		fetchGitHubPosts(lastWeekDate, config.sources).catch((e) => {
			console.error("  GitHub fetch failed:", e.message);
			return [] as Post[];
		}),
		fetchRedditPosts(config.sources).catch((e) => {
			console.error("  Reddit fetch failed:", e.message);
			return [] as Post[];
		}),
		fetchReplicatePosts(env, config.sources).catch((e) => {
			console.error("  Replicate fetch failed:", e.message);
			return [] as Post[];
		}),
	]);

	const allPosts: Post[] = [...huggingFacePosts, ...gitHubPosts, ...redditPosts, ...replicatePosts];
	console.log(`  Fetched ${allPosts.length} posts total`);
	console.log(`    - HuggingFace: ${huggingFacePosts.length}`);
	console.log(`    - GitHub: ${gitHubPosts.length}`);
	console.log(`    - Reddit: ${redditPosts.length}`);
	console.log(`    - Replicate: ${replicatePosts.length}`);

	// 2. Save to SQLite (without LLM scores yet)
	console.log("\n[2/5] Saving to SQLite...");
	let saved = 0;
	for (const post of allPosts) {
		try {
			db.upsert(post);
			saved++;
		} catch (err) {
			console.error(`  Error saving ${post.id}:`, err);
		}
	}
	console.log(`  Saved ${saved} posts`);

	// 3. LLM Scoring
	console.log("\n[3/5] LLM Scoring (unscored posts)...");
	const unscoredPosts = db.getUnscoredPosts(300);
	console.log(`  Found ${unscoredPosts.length} unscored posts`);

	if (unscoredPosts.length > 0) {
		await scorePosts(unscoredPosts, config, { batchSize: 5, delayMs: 200 });
	}

	// 4. LLM Enrichment (top scored posts)
	console.log("\n[4/5] LLM Enrichment (top posts)...");
	const topPosts = db.getTopScoredPosts(0.6, 50);
	console.log(`  Found ${topPosts.length} top posts needing enrichment`);

	if (topPosts.length > 0) {
		await enrichPosts(topPosts, config, { delayMs: 500 });
	}

	// 5. Export to Markdown
	console.log("\n[5/6] Exporting to Markdown...");
	const { saveExports } = await import("./export");
	saveExports();

	// 6. Done
	console.log("\n[6/6] Update complete!");
	console.log("=".repeat(50));

	// Summary
	const stats = {
		total_fetched: allPosts.length,
		saved_to_db: saved,
		scored: unscoredPosts.length,
		enriched: topPosts.length,
	};
	console.log("\nSummary:", JSON.stringify(stats, null, 2));
}

// Parse command line args
const args = process.argv.slice(2);
const isDaemon = args.includes("--daemon");
const intervalHours = parseInt(args.find(a => a.startsWith("--interval="))?.split("=")[1] || "24");

async function runOnce(): Promise<void> {
	await updateContentLocal();
	db.close();
	process.exit(0);
}

async function runDaemon(): Promise<void> {
	const intervalMs = intervalHours * 60 * 60 * 1000;

	console.log(`Daemon mode: updates every ${intervalHours} hours`);
	console.log(`Next update: now`);
	console.log("Press Ctrl+C to stop\n");

	// Run immediately
	await updateContentLocal().catch(err => console.error("Update failed:", err));

	// Then run on interval
	setInterval(async () => {
		console.log(`\n[${new Date().toISOString()}] Running scheduled update...`);
		await updateContentLocal().catch(err => console.error("Update failed:", err));
	}, intervalMs);
}

// Run if called directly
if (require.main === module) {
	if (isDaemon) {
		runDaemon();
	} else {
		runOnce().catch((err) => {
			console.error("Update failed:", err);
			process.exit(1);
		});
	}
}
