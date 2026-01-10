import { callSonnet } from "./client";
import { loadPromptTemplate } from "./prompts";
import type { Post, Config } from "../types";
import { posts as db } from "../db-local";

export interface EnrichmentResult {
	summary: string;
	relevance: string;
}

function buildEnrichmentPrompt(post: Post, config: Config): string {
	const template = loadPromptTemplate("enrichment");

	return template
		.replace("{{language}}", config.language)
		.replace("{{post.source}}", post.source)
		.replace("{{post.name}}", post.name || "")
		.replace("{{post.username}}", post.username || "")
		.replace("{{post.description}}", post.description || "(no description)")
		.replace("{{post.url}}", post.url)
		.replace("{{post.stars}}", String(post.stars))
		.replace("{{post.matched_interest}}", post.matched_interest || "general ML/AI interest")
		.replace("{{profile}}", config.profile);
}

function parseEnrichmentResponse(response: string): EnrichmentResult {
	try {
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			return {
				summary: parsed.summary || "",
				relevance: parsed.relevance || "",
			};
		}
	} catch (e) {
		console.error("Failed to parse LLM enrichment response:", response);
	}
	return { summary: "", relevance: "" };
}

export async function enrichPost(post: Post, config: Config): Promise<EnrichmentResult> {
	const prompt = buildEnrichmentPrompt(post, config);

	try {
		const response = await callSonnet(prompt);
		return parseEnrichmentResponse(response);
	} catch (error) {
		console.error(`Error enriching post ${post.id}:`, error);
		return { summary: "", relevance: "" };
	}
}

export async function enrichPosts(
	postsToEnrich: Post[],
	config: Config,
	options: { delayMs?: number } = {}
): Promise<void> {
	const { delayMs = 500 } = options;

	console.log(`Enriching ${postsToEnrich.length} top posts (language: ${config.language})...`);

	for (let i = 0; i < postsToEnrich.length; i++) {
		const post = postsToEnrich[i];

		const result = await enrichPost(post, config);

		if (result.summary && result.relevance) {
			db.updateEnrichment(post.id, post.source, result.summary, result.relevance);
			console.log(`  Enriched ${post.source}/${post.name}`);
		} else {
			console.log(`  Failed to enrich ${post.source}/${post.name}`);
		}

		// Rate limiting (Sonnet is more expensive, be careful)
		if (i + 1 < postsToEnrich.length && delayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	console.log(`Finished enriching ${postsToEnrich.length} posts`);
}
