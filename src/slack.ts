/**
 * Slack Webhook integration for sending daily digest
 */

import { posts as db } from "./db-local";

interface SlackConfig {
	webhookUrl: string;
}

function getConfig(): SlackConfig | null {
	const webhookUrl = process.env.SLACK_WEBHOOK_URL;

	if (!webhookUrl) {
		return null;
	}

	return { webhookUrl };
}

async function sendMessage(config: SlackConfig, text: string, blocks?: any[]): Promise<boolean> {
	try {
		const body: any = { text };
		if (blocks) {
			body.blocks = blocks;
		}

		const response = await fetch(config.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			console.error("Slack API error:", response.status, await response.text());
			return false;
		}
		return true;
	} catch (error) {
		console.error("Failed to send Slack message:", error);
		return false;
	}
}

function formatPostAsBlocks(post: any, index: number): any[] {
	const score = (post.relevance_score * 100).toFixed(0);
	const name = post.name || "Untitled";
	const source = post.source || "unknown";
	const interest = post.matched_interest || "—";
	const summary = post.summary || "";

	const blocks: any[] = [
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*${index}. <${post.url}|${name}>* [${score}% · ${source}]`,
			},
		},
	];

	if (summary) {
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: summary,
			},
		});
	}

	blocks.push({
		type: "context",
		elements: [
			{
				type: "mrkdwn",
				text: `_${interest}_`,
			},
		],
	});

	return blocks;
}

function formatPostAsText(post: any, index: number): string {
	const score = (post.relevance_score * 100).toFixed(0);
	const name = post.name || "Untitled";
	const source = post.source || "unknown";
	const interest = post.matched_interest || "—";
	const summary = post.summary || "";

	let text = `*${index}. <${post.url}|${name}>* [${score}% · ${source}]\n`;
	if (summary) {
		text += `${summary}\n`;
	}
	text += `_(${interest})_\n`;

	return text;
}

export async function sendSlackDigest(minScore: number = 0.7): Promise<void> {
	const config = getConfig();

	if (!config) {
		console.log("Slack not configured (SLACK_WEBHOOK_URL not set), skipping");
		return;
	}

	// Get posts that haven't been sent to Slack yet
	const topPosts = db.getUnsentSlackPosts(minScore);

	if (topPosts.length === 0) {
		console.log("No new posts to send to Slack");
		return;
	}

	const date = new Date().toLocaleDateString("en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	// Build message with blocks for rich formatting
	const headerBlocks: any[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "🔥 HypeSeeker Digest",
				emoji: true,
			},
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `📅 ${date}`,
				},
			],
		},
		{
			type: "divider",
		},
	];

	// Slack has a limit of 50 blocks per message, so we may need to split
	const MAX_BLOCKS = 45; // Leave room for header/footer
	let currentBlocks = [...headerBlocks];
	let messageCount = 0;

	for (let i = 0; i < topPosts.length; i++) {
		const postBlocks = formatPostAsBlocks(topPosts[i], i + 1);

		if (currentBlocks.length + postBlocks.length > MAX_BLOCKS) {
			// Send current batch
			await sendMessage(config, `HypeSeeker Digest - Part ${messageCount + 1}`, currentBlocks);
			await new Promise((r) => setTimeout(r, 500)); // Rate limit
			messageCount++;
			currentBlocks = [];
		}

		currentBlocks.push(...postBlocks);

		// Add divider between posts (except last)
		if (i < topPosts.length - 1) {
			currentBlocks.push({ type: "divider" });
		}
	}

	// Add footer with stats
	const allPosts = db.getAll();
	const scoredCount = allPosts.filter((p) => p.relevance_score != null).length;

	currentBlocks.push(
		{ type: "divider" },
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `📊 Scored: ${scoredCount} of ${allPosts.length} posts`,
				},
			],
		}
	);

	// Send final batch
	const fallbackText = topPosts.map((p, i) => formatPostAsText(p, i + 1)).join("\n");
	await sendMessage(config, fallbackText, currentBlocks);

	// Mark all sent posts as sent
	db.markAsSentToSlack(topPosts.map((p) => ({ id: p.id, source: p.source })));

	console.log(`Sent digest with ${topPosts.length} posts to Slack`);
}

// CLI: run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	// Load .env
	const fs = await import("fs");
	const path = await import("path");
	const yaml = await import("yaml");

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

	// Load config for threshold
	const configPath = path.join(process.cwd(), "config", "config.yaml");
	const configContent = fs.readFileSync(configPath, "utf-8");
	const appConfig = yaml.parse(configContent);
	const threshold = (appConfig.min_score_for_digest ?? 70) / 100;

	sendSlackDigest(threshold).then(() => {
		db.close();
		process.exit(0);
	});
}
