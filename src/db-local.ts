import Database from "better-sqlite3";
import type { Post } from "./types";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "posts.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
	if (!db) {
		db = new Database(DB_PATH);
		db.pragma("journal_mode = WAL");
		initSchema();
	}
	return db;
}

function initSchema(): void {
	const database = db!;
	database.exec(`
		CREATE TABLE IF NOT EXISTS posts (
			id TEXT NOT NULL,
			source TEXT NOT NULL,
			username TEXT,
			name TEXT,
			stars INTEGER,
			description TEXT,
			url TEXT,
			created_at TEXT,
			relevance_score REAL,
			matched_interest TEXT,
			summary TEXT,
			relevance TEXT,
			scored_at TEXT,
			inserted_at TEXT DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id, source)
		);

		CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
		CREATE INDEX IF NOT EXISTS idx_posts_relevance ON posts(relevance_score DESC);
		CREATE INDEX IF NOT EXISTS idx_posts_source ON posts(source);
	`);
}

const BANNED_STRINGS = ["nft", "crypto", "telegram", "clicker", "solana", "stealer"];

function isValidPost(post: Post): boolean {
	const name = post.name?.toLowerCase() || "";
	const desc = post.description?.toLowerCase() || "";
	if (!post.username?.trim()) return false;
	for (const s of BANNED_STRINGS) {
		if (name.includes(s) || desc.includes(s)) return false;
	}
	if (name.includes("stake") && name.includes("predict")) return false;
	return true;
}

function scorePost(post: Post): number {
	// Base score from stars
	let baseScore: number;
	if (post.source === "reddit") baseScore = post.stars * 0.3;
	else if (post.source === "replicate") baseScore = Math.pow(post.stars, 0.6);
	else baseScore = post.stars;

	// LLM relevance boost (if scored)
	const llmBoost = (post.relevance_score || 0) * 100;

	return baseScore + llmBoost;
}

export type FilterType = "past_day" | "past_three_days" | "past_week";

function getFromDate(filter: FilterType): Date {
	const now = new Date();
	const fromDate = new Date();
	if (filter === "past_day") fromDate.setDate(now.getDate() - 1);
	else if (filter === "past_three_days") fromDate.setDate(now.getDate() - 3);
	else fromDate.setDate(now.getDate() - 7);
	return fromDate;
}

export const posts = {
	query(options: { filter: FilterType; sources: string[] }): Post[] {
		const database = getDb();
		const fromDate = getFromDate(options.filter);
		const sourcesLower = options.sources.map((s) => s.toLowerCase());

		const placeholders = sourcesLower.map(() => "?").join(",");
		const stmt = database.prepare(`
			SELECT * FROM posts
			WHERE source IN (${placeholders})
			  AND created_at > ?
			ORDER BY stars DESC
			LIMIT 500
		`);

		const rows = stmt.all(...sourcesLower, fromDate.toISOString()) as Post[];
		const filtered = rows.filter(isValidPost);
		filtered.sort((a, b) => scorePost(b) - scorePost(a));
		return filtered;
	},

	upsert(post: Post): void {
		const database = getDb();
		const stmt = database.prepare(`
			INSERT INTO posts (id, source, username, name, stars, description, url, created_at, relevance_score, matched_interest, summary, relevance, scored_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id, source) DO UPDATE SET
				stars = excluded.stars,
				description = excluded.description,
				relevance_score = COALESCE(excluded.relevance_score, relevance_score),
				matched_interest = COALESCE(excluded.matched_interest, matched_interest),
				summary = COALESCE(excluded.summary, summary),
				relevance = COALESCE(excluded.relevance, relevance),
				scored_at = COALESCE(excluded.scored_at, scored_at)
		`);

		stmt.run(
			post.id,
			post.source,
			post.username,
			post.name,
			post.stars,
			post.description,
			post.url,
			post.created_at,
			post.relevance_score || null,
			post.matched_interest || null,
			post.summary || null,
			post.relevance || null,
			post.scored_at || null
		);
	},

	getLastUpdated(): string | null {
		const database = getDb();
		const stmt = database.prepare("SELECT MAX(inserted_at) as last_updated FROM posts");
		const row = stmt.get() as { last_updated: string | null } | undefined;
		return row?.last_updated || null;
	},

	getUnscoredPosts(limit: number = 300): Post[] {
		const database = getDb();
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

		const stmt = database.prepare(`
			SELECT * FROM posts
			WHERE relevance_score IS NULL
			  AND created_at > ?
			ORDER BY stars DESC
			LIMIT ?
		`);

		return stmt.all(oneWeekAgo.toISOString(), limit) as Post[];
	},

	getTopScoredPosts(minScore: number = 0.6, limit: number = 50): Post[] {
		const database = getDb();
		const stmt = database.prepare(`
			SELECT * FROM posts
			WHERE relevance_score >= ?
			  AND summary IS NULL
			ORDER BY relevance_score DESC, stars DESC
			LIMIT ?
		`);

		return stmt.all(minScore, limit) as Post[];
	},

	updateScore(id: string, source: string, score: number, matchedInterest: string | null): void {
		const database = getDb();
		const stmt = database.prepare(`
			UPDATE posts
			SET relevance_score = ?, matched_interest = ?, scored_at = ?
			WHERE id = ? AND source = ?
		`);
		stmt.run(score, matchedInterest, new Date().toISOString(), id, source);
	},

	updateEnrichment(id: string, source: string, summary: string, relevance: string): void {
		const database = getDb();
		const stmt = database.prepare(`
			UPDATE posts
			SET summary = ?, relevance = ?
			WHERE id = ? AND source = ?
		`);
		stmt.run(summary, relevance, id, source);
	},

	close(): void {
		if (db) {
			db.close();
			db = null;
		}
	}
};
