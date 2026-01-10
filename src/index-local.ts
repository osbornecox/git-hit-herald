import { Hono } from "hono";
import { serve } from "@hono/node-server";
import Mustache from "mustache";
import { posts, FilterType } from "./db-local";
import type { Post } from "./types";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALL_SOURCES = ["GitHub", "HuggingFace", "Reddit", "Replicate"];

interface PostData {
	index: number;
	displayName: string;
	icon: string;
	description: string;
	url: string;
	stars: number;
	relevance_score?: number;
	summary_ru?: string;
	relevance_ru?: string;
	has_russian?: boolean;
}

function preparePostData(post: Post, index: number): PostData {
	const isRepo = post.source === "huggingface" || post.source === "github" || post.source === "replicate";
	const displayName = isRepo ? `${post.username}/${post.name}` : post.name;
	const icon =
		post.source === "huggingface"
			? "🤗"
			: post.source === "reddit"
				? "👽"
				: post.source === "replicate"
					? "®️"
					: "⭐";
	const description = isRepo ? post.description : `${post.username} on ${post.description}`;

	return {
		index: index + 1,
		displayName,
		icon,
		description: description || "",
		url: post.url,
		stars: post.stars,
		relevance_score: post.relevance_score,
		summary_ru: post.summary_ru,
		relevance_ru: post.relevance_ru,
		has_russian: !!(post.summary_ru && post.relevance_ru),
	};
}

function renderPage(
	postList: Post[],
	filter: string,
	sources: string[],
	lastUpdatedTimestamp: number | null
): string {
	const templatePath = path.join(__dirname, "templates", "page-local.html");
	const template = fs.readFileSync(templatePath, "utf-8");

	const filterLinks = [
		{ key: "past_day", label: "Past Day" },
		{ key: "past_three_days", label: "Past 3 Days" },
		{ key: "past_week", label: "Past Week" },
	].map((f, i) => ({
		...f,
		active: filter === f.key || (!filter && f.key === "past_week"),
		first: i === 0,
		sourcesParam: sources.join(","),
	}));

	const view = {
		filter: filter || "past_week",
		filterLinks,
		lastUpdatedTimestamp,
		posts: postList.map((post, i) => preparePostData(post, i)),
		sources: ALL_SOURCES.map((name) => ({
			name,
			checked: sources.map((s) => s.toLowerCase()).includes(name.toLowerCase()),
		})),
	};

	return Mustache.render(template, view);
}

const app = new Hono();

app.get("/", async (c) => {
	const filter = (c.req.query("filter") || "past_week") as FilterType;
	const sourcesParam = c.req.query("sources") || ALL_SOURCES.join(",");
	const sources = sourcesParam.split(",").filter(Boolean);

	const postList = posts.query({ filter, sources });
	const lastUpdatedRaw = posts.getLastUpdated();
	const lastUpdatedTimestamp = lastUpdatedRaw ? new Date(lastUpdatedRaw).getTime() : null;

	return c.html(renderPage(postList, filter, sources, lastUpdatedTimestamp));
});

app.get("/api/posts", async (c) => {
	const filter = (c.req.query("filter") || "past_week") as FilterType;
	const sourcesParam = c.req.query("sources") || ALL_SOURCES.join(",");
	const sources = sourcesParam.split(",").filter(Boolean);

	const postList = posts.query({ filter, sources });
	return c.json(postList);
});

app.get("/api/last-updated", async (c) => {
	const lastUpdated = posts.getLastUpdated();
	return c.json({ last_updated: lastUpdated });
});

const port = parseInt(process.env.PORT || "8787");

console.log(`Starting Hype local server on http://localhost:${port}`);

serve({
	fetch: app.fetch,
	port,
});
