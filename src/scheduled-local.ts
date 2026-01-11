import { fetchGitHubPosts, fetchHuggingFacePosts, fetchRedditPosts, fetchReplicatePosts } from "./fetchers";
import { posts as db } from "./db-local";
import { scorePosts } from "./llm/scorer";
import { enrichPosts } from "./llm/enricher";
import { fetchReadmesForPosts } from "./readme-fetcher";
import { sendDailyDigest } from "./telegram";
import type { Post, Config } from "./types";
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

export async function updateContentLocal(options: { fetchOnly?: boolean; scoreOnly?: boolean } = {}): Promise<void> {
	console.log("Starting local content update...");
	console.log("=".repeat(50));

	const config = loadConfig();
	const date = new Date();
	date.setDate(date.getDate() - 7);
	const lastWeekDate = date.toISOString().slice(0, 10);

	console.log(`Using language: ${config.language}`);

	let saved = 0;

	// 1. Fetch from all sources (skip if --score-only)
	if (options.scoreOnly) {
		console.log("\n[1/7] Fetching SKIPPED (--score-only)");
		console.log("\n[2/7] Saving SKIPPED (--score-only)");
	} else {
		console.log("\n[1/7] Fetching posts from sources...");

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
			fetchReplicatePosts(config.sources).catch((e) => {
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
		console.log("\n[2/7] Saving to SQLite...");
		for (const post of allPosts) {
			try {
				db.upsert(post);
				saved++;
			} catch (err) {
				console.error(`  Error saving ${post.id}:`, err);
			}
		}
	}
	console.log(`  Saved ${saved} posts`);

	// 3. Fetch README for GitHub posts (enriches description for better scoring)
	const unscoredPosts = db.getUnscoredPosts(300);
	const githubPostsNeedingReadme = unscoredPosts.filter(
		(p) => p.source === "github" && (!p.description || p.description.length < 200)
	);

	if (options.fetchOnly) {
		console.log(`\n[3/7] README Fetch SKIPPED (--fetch-only)`);
		console.log(`  Would fetch README for ${githubPostsNeedingReadme.length} GitHub posts`);
	} else if (githubPostsNeedingReadme.length > 0) {
		console.log(`\n[3/7] Fetching README for GitHub posts...`);
		console.log(`  ${githubPostsNeedingReadme.length} posts need README`);

		const postsForReadme = githubPostsNeedingReadme.map((p) => ({ id: p.id, url: p.url }));
		const readmes = await fetchReadmesForPosts(postsForReadme);

		// Update descriptions with README content
		let updatedCount = 0;
		for (const post of githubPostsNeedingReadme) {
			const readme = readmes.get(post.id);
			if (readme && readme.length > (post.description?.length || 0)) {
				// Combine description + README for richer context
				const enrichedDesc = post.description
					? `${post.description}\n\n---\n\n${readme}`
					: readme;
				db.updateDescription(post.id, post.source, enrichedDesc);
				updatedCount++;
			}
		}
		console.log(`  Updated ${updatedCount} posts with README content`);
	} else {
		console.log(`\n[3/7] README Fetch SKIPPED (no posts need README)`);
	}

	// Refresh unscored posts (now with README in description)
	const postsToScore = db.getUnscoredPosts(300);

	// 4. LLM Scoring
	if (options.fetchOnly) {
		console.log("\n[4/7] LLM Scoring SKIPPED (--fetch-only)");
		console.log(`  Would score ${postsToScore.length} posts`);
	} else {
		console.log("\n[4/7] LLM Scoring (unscored posts)...");
		console.log(`  Found ${postsToScore.length} unscored posts`);
		if (postsToScore.length > 0) {
			await scorePosts(postsToScore, config, { batchSize: 10, delayMs: 500 });
		}
	}

	// 5. LLM Enrichment (posts with score >= 70%)
	const topPosts = db.getTopScoredPosts(0.7, 200);
	if (options.fetchOnly) {
		console.log("\n[5/7] LLM Enrichment SKIPPED (--fetch-only)");
		console.log(`  Would enrich ${topPosts.length} posts`);
	} else {
		console.log("\n[5/7] LLM Enrichment (top posts)...");
		console.log(`  Found ${topPosts.length} top posts needing enrichment`);
		if (topPosts.length > 0) {
			await enrichPosts(topPosts, config, { delayMs: 500 });
		}
	}

	// 6. Export
	console.log("\n[6/7] Exporting...");
	const { saveExports } = await import("./export");
	saveExports();

	// 7. Send to Telegram
	if (options.fetchOnly) {
		console.log("\n[7/7] Telegram SKIPPED (--fetch-only)");
	} else {
		console.log("\n[7/7] Sending to Telegram...");
		await sendDailyDigest();
	}

	// Done
	console.log("\nUpdate complete!");
	console.log("=".repeat(50));

	// Summary
	const stats = {
		total_fetched: options.scoreOnly ? 0 : saved,
		saved_to_db: saved,
		readme_fetched: githubPostsNeedingReadme.length,
		scored: postsToScore.length,
		enriched: topPosts.length,
	};
	console.log("\nSummary:", JSON.stringify(stats, null, 2));
}

// Parse command line args
const args = process.argv.slice(2);
const isFetchOnly = args.includes("--fetch-only");
const isScoreOnly = args.includes("--score-only");

// Run
updateContentLocal({ fetchOnly: isFetchOnly, scoreOnly: isScoreOnly })
	.then(() => {
		db.close();
		process.exit(0);
	})
	.catch((err) => {
		console.error("Update failed:", err);
		process.exit(1);
	});
