import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
	if (!client) {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error("ANTHROPIC_API_KEY environment variable is required");
		}
		client = new Anthropic({ apiKey });
	}
	return client;
}

export interface LLMResponse {
	content: string;
}

export async function callHaiku(prompt: string): Promise<string> {
	const anthropic = getAnthropicClient();

	const response = await anthropic.messages.create({
		model: "claude-3-5-haiku-20241022",
		max_tokens: 256,
		messages: [{ role: "user", content: prompt }],
	});

	const textBlock = response.content.find((block) => block.type === "text");
	return textBlock ? textBlock.text : "";
}

export async function callSonnet(prompt: string): Promise<string> {
	const anthropic = getAnthropicClient();

	const response = await anthropic.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 512,
		messages: [{ role: "user", content: prompt }],
	});

	const textBlock = response.content.find((block) => block.type === "text");
	return textBlock ? textBlock.text : "";
}
