import { fetchGitHubPosts, fetchHuggingFacePosts, fetchRedditPosts, fetchReplicatePosts } from "./fetchers";
import { posts as db } from "./db-local";
import { scorePosts } from "./llm/scorer";
import { enrichPosts } from "./llm/enricher";
import type { Post, Interests } from "./types";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

function loadInterests(): Interests {
	const configPath = path.join(process.cwd(), "config", "interests.yaml");
	const content = fs.readFileSync(configPath, "utf-8");
	return yaml.parse(content) as Interests;
}

// Minimal env for fetchers that need it (only Replicate uses env)
function createMinimalEnv(): Env {
	return {
		REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || "",
		SUPABASE_URL: "",
		SUPABASE_ANON_KEY: "",
	} as Env;
}

export async function updateContentLocal(): Promise<void> {
	console.log("Starting local content update...");
	console.log("=".repeat(50));

	const env = createMinimalEnv();
	const date = new Date();
	date.setDate(date.getDate() - 7);
	const lastWeekDate = date.toISOString().slice(0, 10);

	// 1. Fetch from all sources
	console.log("\n[1/5] Fetching posts from sources...");

	const [huggingFacePosts, gitHubPosts, redditPosts, replicatePosts] = await Promise.all([
		fetchHuggingFacePosts().catch((e) => {
			console.error("  HuggingFace fetch failed:", e.message);
			return [] as Post[];
		}),
		fetchGitHubPosts(lastWeekDate).catch((e) => {
			console.error("  GitHub fetch failed:", e.message);
			return [] as Post[];
		}),
		fetchRedditPosts().catch((e) => {
			console.error("  Reddit fetch failed:", e.message);
			return [] as Post[];
		}),
		fetchReplicatePosts(env).catch((e) => {
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
	const interests = loadInterests();
	const unscoredPosts = db.getUnscoredPosts(300);
	console.log(`  Found ${unscoredPosts.length} unscored posts`);

	if (unscoredPosts.length > 0) {
		await scorePosts(unscoredPosts, interests, { batchSize: 5, delayMs: 200 });
	}

	// 4. LLM Enrichment (top scored posts without Russian descriptions)
	console.log("\n[4/5] LLM Enrichment (top posts)...");
	const topPosts = db.getTopScoredPosts(0.6, 50);
	console.log(`  Found ${topPosts.length} top posts needing enrichment`);

	if (topPosts.length > 0) {
		await enrichPosts(topPosts, interests, { delayMs: 500 });
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

	db.close();
}

// Run if called directly
if (require.main === module) {
	updateContentLocal()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("Update failed:", err);
			process.exit(1);
		});
}
