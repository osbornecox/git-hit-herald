import { posts } from "./db-local";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "data");

export function exportToMarkdown(limit: number = 50): string {
	const topPosts = posts.query({ filter: "past_week", sources: ["GitHub", "HuggingFace", "Reddit", "Replicate"] });

	// Sort by relevance_score first, then by stars
	const sorted = topPosts
		.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
		.slice(0, limit);

	const date = new Date().toISOString().slice(0, 10);
	let md = `# ML/AI Дайджест — ${date}\n\n`;
	md += `Всего постов: ${topPosts.length} | Показано: ${sorted.length}\n\n`;
	md += `---\n\n`;

	for (let i = 0; i < sorted.length; i++) {
		const post = sorted[i];
		const score = post.relevance_score ? `[${(post.relevance_score * 100).toFixed(0)}%]` : "";
		const icon = post.source === "github" ? "⭐" : post.source === "huggingface" ? "🤗" : post.source === "reddit" ? "👽" : "®️";

		md += `### ${i + 1}. ${post.name} ${score}\n\n`;
		md += `${icon} **${post.source}** | ${post.stars} stars | [${post.username}/${post.name}](${post.url})\n\n`;

		if (post.summary_ru) {
			md += `${post.summary_ru}\n\n`;
		}
		if (post.relevance_ru) {
			md += `> ${post.relevance_ru}\n\n`;
		}
		if (!post.summary_ru && post.description) {
			md += `${post.description}\n\n`;
		}

		md += `---\n\n`;
	}

	return md;
}

export function exportToCSV(): string {
	const allPosts = posts.query({ filter: "past_week", sources: ["GitHub", "HuggingFace", "Reddit", "Replicate"] });

	const sorted = allPosts.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

	const headers = ["score", "source", "name", "stars", "url", "summary_ru", "relevance_ru", "description"];
	const rows = sorted.map(p => [
		((p.relevance_score || 0) * 100).toFixed(0),
		p.source,
		`"${(p.name || "").replace(/"/g, '""')}"`,
		p.stars,
		p.url,
		`"${(p.summary_ru || "").replace(/"/g, '""')}"`,
		`"${(p.relevance_ru || "").replace(/"/g, '""')}"`,
		`"${(p.description || "").replace(/"/g, '""')}"`,
	]);

	return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export function saveExports(): void {
	const date = new Date().toISOString().slice(0, 10);

	// Markdown
	const md = exportToMarkdown(50);
	const mdPath = path.join(OUTPUT_DIR, `digest-${date}.md`);
	fs.writeFileSync(mdPath, md);
	console.log(`Saved: ${mdPath}`);

	// CSV
	const csv = exportToCSV();
	const csvPath = path.join(OUTPUT_DIR, `posts-${date}.csv`);
	fs.writeFileSync(csvPath, csv);
	console.log(`Saved: ${csvPath}`);
}

// Run if called directly
if (require.main === module) {
	saveExports();
	posts.close();
}
