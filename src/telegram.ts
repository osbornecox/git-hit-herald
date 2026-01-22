/**
 * Telegram Bot integration for sending daily digest
 */

import { posts as db } from "./db-local";

const TELEGRAM_API = "https://api.telegram.org/bot";

interface TelegramConfig {
	botToken: string;
	chatId: string;
}

function getConfig(): TelegramConfig {
	const botToken = process.env.TELEGRAM_BOT_TOKEN;
	const chatId = process.env.TELEGRAM_CHAT_ID;

	if (!botToken || !chatId) {
		throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required in .env");
	}

	return { botToken, chatId };
}

async function sendMessage(config: TelegramConfig, text: string, parseMode: string = "HTML"): Promise<boolean> {
	const url = `${TELEGRAM_API}${config.botToken}/sendMessage`;

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: config.chatId,
				text,
				parse_mode: parseMode,
				disable_web_page_preview: true,
			}),
		});

		const result = await response.json();
		if (!result.ok) {
			console.error("Telegram API error:", result);
			return false;
		}
		return true;
	} catch (error) {
		console.error("Failed to send Telegram message:", error);
		return false;
	}
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function formatPost(post: any, index: number): string {
	const score = (post.relevance_score * 100).toFixed(0);
	const name = escapeHtml(post.name || "Untitled");
	const source = post.source || "unknown";
	const interest = escapeHtml(post.matched_interest || "—");
	const summary = post.summary ? escapeHtml(post.summary) : "";

	let text = `<b>${index}. <a href="${post.url}">${name}</a></b> [${score}% · ${source}]\n`;
	if (summary) {
		text += `\n${summary}\n\n`;
	}
	text += `(${interest})\n`;

	return text;
}

export async function sendDailyDigest(minScore: number = 0.7): Promise<void> {
	const config = getConfig();

	// Get posts scored in the last 24 hours with score >= threshold
	const oneDayAgo = new Date();
	oneDayAgo.setHours(oneDayAgo.getHours() - 24);
	const cutoff = oneDayAgo.toISOString();

	const topPosts = db.getAll()
		.filter((p) =>
			p.relevance_score != null &&
			p.relevance_score >= minScore &&
			p.scored_at != null &&
			p.scored_at >= cutoff
		)
		.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

	if (topPosts.length === 0) {
		console.log("No posts to send");
		return;
	}

	const date = new Date().toLocaleDateString("ru-RU", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	let message = `🔥 <b>HypeSeeker Digest</b>\n`;
	message += `📅 ${date}\n\n`;

	for (let i = 0; i < topPosts.length; i++) {
		message += formatPost(topPosts[i], i + 1);
		message += "\n";
	}

	const allPosts = db.getAll();
	const scoredCount = allPosts.filter(p => p.relevance_score != null).length;
	message += `\n📊 Отскорено: ${scoredCount} из ${allPosts.length} постов`;

	// Telegram has 4096 char limit, split if needed
	if (message.length > 4000) {
		// Send in chunks
		const posts = topPosts;
		const chunkSize = 5;

		for (let i = 0; i < posts.length; i += chunkSize) {
			const chunk = posts.slice(i, i + chunkSize);
			let chunkMessage = i === 0
				? `🔥 <b>HypeSeeker Digest</b>\n📅 ${date}\n\n`
				: "";

			for (let j = 0; j < chunk.length; j++) {
				chunkMessage += formatPost(chunk[j], i + j + 1);
				chunkMessage += "\n";
			}

			if (i + chunkSize >= posts.length) {
				const all = db.getAll();
				const scored = all.filter(p => p.relevance_score != null).length;
				chunkMessage += `\n📊 Отскорено: ${scored} из ${all.length} постов`;
			}

			await sendMessage(config, chunkMessage);
			await new Promise((r) => setTimeout(r, 500)); // Rate limit
		}
	} else {
		await sendMessage(config, message);
	}

	console.log(`Sent digest with ${topPosts.length} posts to Telegram`);
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

	sendDailyDigest(threshold).then(() => {
		db.close();
		process.exit(0);
	});
}