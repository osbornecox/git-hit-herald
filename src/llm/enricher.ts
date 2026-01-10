import { callSonnet } from "./client";
import type { Post, Interests } from "../types";
import { posts as db } from "../db-local";

export interface EnrichmentResult {
	summary_ru: string;
	relevance_ru: string;
}

function buildEnrichmentPrompt(post: Post, interests: Interests): string {
	return `Ты — помощник для анализа ML/AI новостей на русском языке.

## Пост:
- Источник: ${post.source}
- Название: ${post.name}
- Автор: ${post.username}
- Описание: ${post.description || "(нет описания)"}
- URL: ${post.url}
- Звёзды/лайки: ${post.stars}
- Совпавший интерес: ${post.matched_interest || "общий интерес к ML/AI"}

## Профиль пользователя:
${interests.profile}

## Задача:
Напиши на русском языке два коротких абзаца:

1. **Про что:** Кратко опиши суть проекта/новости (2-3 предложения). Что это, для чего нужно, какую проблему решает.

2. **Почему в фиде:** Объясни, почему это релевантно для пользователя, основываясь на его интересах (1-2 предложения).

Ответь ТОЛЬКО валидным JSON (без markdown):
{"summary_ru": "Про что: ...", "relevance_ru": "Почему в фиде: ..."}`;
}

function parseEnrichmentResponse(response: string): EnrichmentResult {
	try {
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			return {
				summary_ru: parsed.summary_ru || "",
				relevance_ru: parsed.relevance_ru || "",
			};
		}
	} catch (e) {
		console.error("Failed to parse LLM enrichment response:", response);
	}
	return { summary_ru: "", relevance_ru: "" };
}

export async function enrichPost(post: Post, interests: Interests): Promise<EnrichmentResult> {
	const prompt = buildEnrichmentPrompt(post, interests);

	try {
		const response = await callSonnet(prompt);
		return parseEnrichmentResponse(response);
	} catch (error) {
		console.error(`Error enriching post ${post.id}:`, error);
		return { summary_ru: "", relevance_ru: "" };
	}
}

export async function enrichPosts(
	postsToEnrich: Post[],
	interests: Interests,
	options: { delayMs?: number } = {}
): Promise<void> {
	const { delayMs = 500 } = options;

	console.log(`Enriching ${postsToEnrich.length} top posts with Russian descriptions...`);

	for (let i = 0; i < postsToEnrich.length; i++) {
		const post = postsToEnrich[i];

		const result = await enrichPost(post, interests);

		if (result.summary_ru && result.relevance_ru) {
			db.updateEnrichment(post.id, post.source, result.summary_ru, result.relevance_ru);
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
