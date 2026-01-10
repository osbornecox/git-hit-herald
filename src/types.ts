import type { Context } from "hono";

export type AppContext = Context<{ Bindings: Env }>;
export type HandleArgs = [AppContext];

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
	summary_ru?: string;           // "Про что: ..."
	relevance_ru?: string;         // "Почему в фиде: ..."
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
