# HypeSeeker

Personalized AI-filtered aggregator for ML/AI news.

Collects posts from GitHub, HuggingFace, Reddit, and Replicate, filters them through LLM based on your interests, and generates summaries in your preferred language.

## How It Differs from the Original

This is a fork of [andreasjansson/python-repos](https://github.com/andreasjansson/python-repos) (Apache 2.0 license).

| Original | HypeSeeker |
|----------|------------|
| Cloudflare Workers | Local execution |
| Supabase | SQLite |
| Same feed for everyone | LLM-based personalization |
| English only | Multi-language support (en, ru) |
| Hardcoded filters | Configurable source filters |

### What's Added

- **LLM Scoring** — Claude Haiku evaluates post relevance based on your profile
- **LLM Enrichment** — Claude Sonnet writes summaries and explains why a post is relevant
- **Unified Config** — Single YAML file for profile, interests, language, and source filters
- **Local Storage** — SQLite database, works offline
- **Export** — Markdown digest and CSV export

## Quick Start

```bash
# Install dependencies
npm install

# Configure API keys
cp .env.example .env
# Fill in ANTHROPIC_API_KEY in .env

# Create your config
cp config/config.example.yaml config/config.yaml
# Edit config/config.yaml with your interests

# Run update (fetch + score + enrich + export)
npm run update
```

## Configuration

### .env (API Keys)

```bash
ANTHROPIC_API_KEY=sk-ant-...
REPLICATE_API_TOKEN=r8_...  # Optional
```

### config/config.yaml

```yaml
# Language for summaries (en, ru)
language: ru

# Your profile for LLM context
profile: |
  ML/AI engineer interested in practical applications.
  Focus on agents, LLMs, and developer tools.

# Interest categories with priority weights
interests:
  high:    # relevance 0.8-1.0
    - Agent systems and multi-agent architectures
    - LLM reasoning, chain-of-thought
  medium:  # relevance 0.5-0.7
    - Fine-tuning and PEFT methods
    - Embeddings and vector databases
  low:     # relevance 0.2-0.4
    - Image generation

# Topics to exclude (relevance = 0)
exclude:
  - NFT, crypto, blockchain
  - Spam bots

# Source-specific settings
sources:
  github:
    min_stars: 10
  reddit:
    subreddits:
      - machinelearning
      - localllama
      - StableDiffusion
    min_score: 20
    flair_filters:
      StableDiffusion:
        - News
        - "Resource | Update"
  huggingface:
    min_likes: 5
    min_downloads: 1
  replicate:
    min_runs: 10
  spam_keywords:
    - nft
    - crypto
    - blockchain
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run update` | Fetch new posts, score, enrich, and export |
| `npm run export` | Export database to Markdown + CSV |
| `npm run dev` | Start Cloudflare dev server (original mode) |

## Project Structure

```
src/
├── scheduled-local.ts  # Update orchestration
├── db-local.ts         # SQLite storage
├── fetchers.ts         # Data fetchers (GitHub, Reddit, HF, Replicate)
├── export.ts           # Markdown + CSV export
├── types.ts            # TypeScript interfaces
├── llm/
│   ├── client.ts       # Anthropic API client
│   ├── scorer.ts       # Relevance scoring (Haiku)
│   └── enricher.ts     # Summary generation (Sonnet)
└── templates/
    └── page-local.html # HTML template

config/
├── config.example.yaml # Example configuration
└── config.yaml         # Your config (gitignored)

data/
└── posts.db            # SQLite database (auto-created)
```

## Changing LLM Models

Models are configured in `src/llm/client.ts`:

| Task | Function | Default Model |
|------|----------|---------------|
| Scoring | `callHaiku()` | `claude-3-5-haiku-20241022` |
| Enrichment | `callSonnet()` | `claude-sonnet-4-20250514` |

To change a model, edit the `model` field in the corresponding function:

```typescript
// src/llm/client.ts, line 24 (scoring)
model: "claude-3-5-haiku-20241022",

// src/llm/client.ts, line 37 (enrichment)
model: "claude-sonnet-4-20250514",
```

**Cost considerations:**
- Haiku is cheaper and faster — good for bulk scoring
- Sonnet is more capable — better for summaries
- You can use Haiku for both tasks to reduce costs

## Security

The following files are gitignored to protect your personal data:
- `.env` — API keys
- `config/config.yaml` — personal interests and profile
- `data/*.db` — local database

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0 — see [LICENSE](LICENSE).

Based on [python-repos](https://github.com/andreasjansson/python-repos) by Andreas Jansson / Replicate.
