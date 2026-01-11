/**
 * Fetches README content from GitHub repositories
 * Used to enrich posts with short/empty descriptions
 */

const MAX_README_LENGTH = 2000; // Truncate to save tokens

interface ReadmeResult {
	content: string | null;
	error?: string;
}

/**
 * Extract owner/repo from GitHub URL
 * e.g. "https://github.com/owner/repo" -> { owner: "owner", repo: "repo" }
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
	const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
	if (!match) return null;
	return { owner: match[1], repo: match[2] };
}

/**
 * Fetch README content for a GitHub repository
 * Tries raw.githubusercontent.com first (no auth needed), falls back to API
 */
export async function fetchReadme(url: string): Promise<ReadmeResult> {
	const parsed = parseGitHubUrl(url);
	if (!parsed) {
		return { content: null, error: "Invalid GitHub URL" };
	}

	const { owner, repo } = parsed;

	// Try common README filenames via raw.githubusercontent.com
	const readmeFiles = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
	const branches = ["main", "master"];

	for (const branch of branches) {
		for (const filename of readmeFiles) {
			try {
				const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filename}`;
				const response = await fetch(rawUrl);

				if (response.ok) {
					let content = await response.text();

					// Truncate if too long
					if (content.length > MAX_README_LENGTH) {
						content = content.substring(0, MAX_README_LENGTH) + "\n\n[truncated]";
					}

					return { content };
				}
			} catch {
				// Try next combination
			}
		}
	}

	// Fallback: try GitHub API (requires token for higher rate limits)
	const token = process.env.GITHUB_TOKEN;
	try {
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
		const headers: Record<string, string> = {
			Accept: "application/vnd.github.v3.raw",
		};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		const response = await fetch(apiUrl, { headers });

		if (response.ok) {
			let content = await response.text();

			if (content.length > MAX_README_LENGTH) {
				content = content.substring(0, MAX_README_LENGTH) + "\n\n[truncated]";
			}

			return { content };
		}

		return { content: null, error: `GitHub API: ${response.status}` };
	} catch (error: any) {
		return { content: null, error: error.message };
	}
}

/**
 * Fetch READMEs for multiple posts in parallel with rate limiting
 */
export async function fetchReadmesForPosts(
	posts: Array<{ id: string; url: string }>,
	options: { batchSize?: number; delayMs?: number } = {}
): Promise<Map<string, string>> {
	const { batchSize = 10, delayMs = 100 } = options;
	const results = new Map<string, string>();

	console.log(`Fetching READMEs for ${posts.length} posts...`);

	for (let i = 0; i < posts.length; i += batchSize) {
		const batch = posts.slice(i, i + batchSize);

		const batchResults = await Promise.all(
			batch.map(async (post) => {
				const result = await fetchReadme(post.url);
				return { id: post.id, content: result.content, error: result.error };
			})
		);

		for (const { id, content, error } of batchResults) {
			if (content) {
				results.set(id, content);
				console.log(`  Fetched README for post ${id} (${content.length} chars)`);
			} else if (error) {
				console.log(`  No README for post ${id}: ${error}`);
			}
		}

		// Rate limiting between batches
		if (i + batchSize < posts.length && delayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	console.log(`Fetched ${results.size}/${posts.length} READMEs`);
	return results;
}
