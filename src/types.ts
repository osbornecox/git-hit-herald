export interface Post {
	id: string;
	source: string;
	username: string;
	name: string;
	stars: number;
	description: string;
	url: string;
	created_at: string;

	// LLM scoring fields
	relevance_score?: number;      // 0.0 - 1.0
	matched_interest?: string;     // which interest matched
	summary?: string;              // post summary in configured language
	relevance?: string;            // relevance explanation in configured language
	scored_at?: string;            // when LLM scored this post
}

export interface Interests {
	profile: string;
	interests: {
		high: string[];
		medium: string[];
		low: string[];
	};
	exclude: string[];
}

// Source-specific configuration
export interface SourceConfig {
	github: {
		min_stars: number;
	};
	reddit: {
		subreddits: string[];
		min_score: number;
		flair_filters?: Record<string, string[]>;
	};
	huggingface: {
		min_likes: number;
		min_downloads: number;
	};
	replicate: {
		min_runs: number;
	};
}

// Full application config (loaded from config.yaml)
export interface Config extends Interests {
	language: string;  // Language for enrichment (e.g., "ru", "en")
	min_score_for_digest: number;  // Minimum score (0-100) for Telegram digest
	sources: SourceConfig;
}
