import { posts } from "./db-local";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "data");

function escapeCsv(str: string | null | undefined): string {
	if (!str) return "";
	// Escape quotes and wrap in quotes if contains comma, quote, or newline
	const escaped = str.replace(/"/g, '""');
	if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n")) {
		return `"${escaped}"`;
	}
	return escaped;
}

export function exportToCSV(): void {
	const allPosts = posts.query({ filter: "past_week", sources: ["GitHub", "HuggingFace", "Reddit", "Replicate"] });

	// Sort: newest first (by inserted_at), then by relevance_score
	const sorted = allPosts.sort((a, b) => {
		// First by inserted_at (newest first)
		const dateA = a.scored_at || a.created_at || "";
		const dateB = b.scored_at || b.created_at || "";
		if (dateB > dateA) return 1;
		if (dateB < dateA) return -1;
		// Then by relevance_score
		return (b.relevance_score || 0) - (a.relevance_score || 0);
	});

	// All fields from DB
	const headers = [
		"id",
		"source",
		"username",
		"name",
		"stars",
		"description",
		"url",
		"created_at",
		"relevance_score",
		"matched_interest",
		"summary",
		"relevance",
		"scored_at",
	];

	const rows = sorted.map(p => [
		escapeCsv(p.id),
		escapeCsv(p.source),
		escapeCsv(p.username),
		escapeCsv(p.name),
		p.stars,
		escapeCsv(p.description),
		escapeCsv(p.url),
		escapeCsv(p.created_at),
		p.relevance_score?.toFixed(2) || "",
		escapeCsv(p.matched_interest),
		escapeCsv(p.summary),
		escapeCsv(p.relevance),
		escapeCsv(p.scored_at),
	].join(","));

	const csv = [headers.join(","), ...rows].join("\n");

	const csvPath = path.join(OUTPUT_DIR, "feed.csv");
	fs.writeFileSync(csvPath, csv);
	console.log(`Saved: ${csvPath} (${sorted.length} posts)`);
}

export function saveExports(): void {
	exportToCSV();
}

// Run if called directly
if (require.main === module) {
	saveExports();
	posts.close();
}
