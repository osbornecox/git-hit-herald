import { callHaiku } from "./client";
import type { Post, Interests } from "../types";
import { posts as db } from "../db-local";
import * as yaml from "yaml";

export interface ScoreResult {
	score: number;
	matched_interest: string | null;
}

function buildScoringPrompt(interests: Interests, post: Post): string {
	const interestsYaml = yaml.stringify(interests.interests);
	const excludeList = interests.exclude.join(", ");

	return `Ты — фильтр ML/AI новостей. Оцени релевантность поста для пользователя.

## Профиль пользователя:
${interests.profile}

## Интересы (high = 0.8-1.0, medium = 0.5-0.7, low = 0.2-0.4):
${interestsYaml}

## Исключить (score = 0):
${excludeList}

## Пост для оценки:
- Источник: ${post.source}
- Название: ${post.name}
- Автор: ${post.username}
- Описание: ${post.description || "(нет описания)"}
- Звёзды/лайки: ${post.stars}

## Задача:
Оцени релевантность поста (0.0-1.0) на основе интересов пользователя.

Ответь ТОЛЬКО валидным JSON (без markdown):
{"score": 0.0, "matched_interest": "название интереса или null"}`;
}

function parseScoreResponse(response: string): ScoreResult {
	try {
		// Try to extract JSON from response
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			return {
				score: Math.max(0, Math.min(1, parsed.score || 0)),
				matched_interest: parsed.matched_interest || null,
			};
		}
	} catch (e) {
		console.error("Failed to parse LLM score response:", response);
	}
	return { score: 0, matched_interest: null };
}

export async function scorePost(post: Post, interests: Interests): Promise<ScoreResult> {
	const prompt = buildScoringPrompt(interests, post);

	try {
		const response = await callHaiku(prompt);
		return parseScoreResponse(response);
	} catch (error) {
		console.error(`Error scoring post ${post.id}:`, error);
		return { score: 0, matched_interest: null };
	}
}

export async function scorePosts(
	postsToScore: Post[],
	interests: Interests,
	options: { batchSize?: number; delayMs?: number } = {}
): Promise<void> {
	const { batchSize = 5, delayMs = 100 } = options;

	console.log(`Scoring ${postsToScore.length} posts...`);

	for (let i = 0; i < postsToScore.length; i += batchSize) {
		const batch = postsToScore.slice(i, i + batchSize);

		// Process batch in parallel
		const results = await Promise.all(
			batch.map(async (post) => {
				const result = await scorePost(post, interests);
				return { post, result };
			})
		);

		// Update database
		for (const { post, result } of results) {
			db.updateScore(post.id, post.source, result.score, result.matched_interest);
			console.log(`  Scored ${post.source}/${post.name}: ${result.score.toFixed(2)} (${result.matched_interest || "no match"})`);
		}

		// Rate limiting
		if (i + batchSize < postsToScore.length && delayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	console.log(`Finished scoring ${postsToScore.length} posts`);
}
