# HypeSeeker

Personalized AI-filtered aggregator for ML/AI news.

Collects posts from GitHub, HuggingFace, Reddit, and Replicate, filters them through LLM based on your interests, and delivers daily digest to Telegram.

## How It Differs from the Original

This is a fork of [andreasjansson/python-repos](https://github.com/andreasjansson/python-repos) (Apache 2.0 license).

| Original | HypeSeeker |
|----------|------------|
| Cloudflare Workers | Local execution |
| Supabase | SQLite |
| Same feed for everyone | LLM-based personalization |
| English only | Multi-language support |
| Web UI | Telegram + CSV export |

### What's Added

- **LLM Scoring** — Fast model evaluates post relevance based on your profile
- **LLM Enrichment** — Stronger model writes summaries and explains relevance
- **Telegram Delivery** — Daily digest sent to your Telegram
- **README Fetching** — Fetches GitHub README for better scoring accuracy
- **Unified Config** — Single YAML file for profile, interests, language, and source filters
- **Local Storage** — SQLite database, works offline

## Quick Start

```bash
# Install dependencies
npm install

# Configure API keys
cp .env.example .env
# Fill in OPENAI_API_KEY (or ANTHROPIC_API_KEY) in .env
# Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for Telegram delivery

# Create your config
cp config/config.example.yaml config/config.yaml
# Edit config/config.yaml with your interests

# Run update (fetch + score + enrich + send to Telegram)
npm run update
```

## Configuration

### .env (API Keys)

```bash
# LLM Provider (choose one)
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...

# LLM Provider selection: "openai" (default) or "anthropic"
LLM_PROVIDER=openai

# Optional
REPLICATE_API_TOKEN=r8_...
GITHUB_TOKEN=ghp_...  # For higher rate limits when fetching README

# Telegram (required for digest delivery)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### config/config.yaml

```yaml
# Language for summaries
# Format: ISO 639-1 code (en, ru, de, fr, es, zh, ja, etc.)
language: en

# Your profile (1-3 sentences)
profile: |
  ML/AI engineer interested in practical applications.
  Focus on agents, LLMs, and developer tools.

# Interest categories with priority weights
interests:
  high:    # score 0.7-1.0 — sent to Telegram
    - Agent systems and multi-agent architectures
    - LLM reasoning, chain-of-thought
  medium:  # score 0.4-0.6
    - Fine-tuning and PEFT methods
    - Embeddings and vector databases
  low:     # score 0.1-0.3
    - Image generation

# Topics to exclude (score = 0)
exclude:
  - NFT, crypto, blockchain
  - Spam bots

# Source-specific settings
sources:
  github:
    min_stars: 5
  reddit:
    subreddits:
      - machinelearning
      - localllama
      - ClaudeAI
      - ChatGPTCoding
    min_score: 10
  huggingface:
    min_likes: 5
    min_downloads: 1
  replicate:
    min_runs: 10
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run update` | Full pipeline: fetch → score → enrich → export → Telegram |
| `npm run telegram` | Send current digest to Telegram (no fetch/score) |
| `npm run export` | Export database to CSV |

## Scheduled Runs

### macOS (launchd)

A launchd plist template is included for scheduled runs:

```bash
# Create plist from example and update paths
cp com.hypeseeker.update.plist.example com.hypeseeker.update.plist
# Edit com.hypeseeker.update.plist — replace /path/to/hypeseeker with your actual path

# Copy to LaunchAgents
cp com.hypeseeker.update.plist ~/Library/LaunchAgents/

# Load (activate)
launchctl load ~/Library/LaunchAgents/com.hypeseeker.update.plist

# Unload (deactivate)
launchctl unload ~/Library/LaunchAgents/com.hypeseeker.update.plist

# Check status
launchctl list | grep hypeseeker
```

Edit schedule times in `com.hypeseeker.update.plist` (default: 11:00 and 18:00).

### Linux/Unix (cron)

```bash
# Edit crontab
crontab -e

# Add lines for 11:00 and 18:00
0 11 * * * cd /path/to/hypeseeker && npm run update
0 18 * * * cd /path/to/hypeseeker && npm run update
```

## Pipeline

The update pipeline runs 7 steps:

1. **Fetch** — Get posts from GitHub, HuggingFace, Reddit, Replicate
2. **Save** — Store in SQLite database
3. **README Fetch** — Get README for GitHub repos with short descriptions
4. **Score** — LLM evaluates relevance (0-100%) based on your interests
5. **Enrich** — LLM writes summaries for top posts (score >= 70%)
6. **Export** — Save to CSV (data/feed.csv)
7. **Telegram** — Send digest with posts scoring >= 70%

## Output Formats

| Format | Location | Description |
|--------|----------|-------------|
| Telegram | Your bot | Primary output — daily digest with top posts (score >= 70%) |
| CSV | `data/feed.csv` | Backup export — all posts with scores (runs in parallel) |
| SQLite | `data/posts.db` | Raw database |

## Project Structure

```
src/
├── scheduled-local.ts  # Update orchestration
├── db-local.ts         # SQLite storage
├── fetchers.ts         # Data fetchers (GitHub, Reddit, HF, Replicate)
├── telegram.ts         # Telegram bot integration
├── readme-fetcher.ts   # GitHub README fetcher
├── export.ts           # CSV export
├── types.ts            # TypeScript interfaces
├── utils.ts            # Utility functions
├── llm/
│   ├── client.ts       # LLM API client (OpenAI/Anthropic)
│   ├── scorer.ts       # Relevance scoring
│   ├── enricher.ts     # Summary generation
│   └── prompts/        # LLM prompt templates

config/
├── config.example.yaml # Example configuration
└── config.yaml         # Your config (gitignored)

data/
├── posts.db            # SQLite database (gitignored)
└── feed.csv            # CSV export (gitignored)
```

## LLM Providers

Supports **OpenAI** or **Anthropic** APIs. Set `LLM_PROVIDER` in `.env`:

| Provider | Scoring (fast) | Enrichment (smart) |
|----------|----------------|-------------------|
| `openai` (default) | gpt-4.1-mini | gpt-4.1 |
| `anthropic` | claude-3-5-haiku | claude-sonnet-4 |

Models and parameters are hardcoded in [src/llm/client.ts](src/llm/client.ts):
- `callHaiku()` — scoring: max_tokens=256, temperature=0.2
- `callSonnet()` — enrichment: max_tokens=512, temperature=0.5

To use a different provider (Gemini, Mistral, etc.), modify `client.ts` directly.

## Telegram Setup

1. Create bot via [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the token to `.env` as `TELEGRAM_BOT_TOKEN`
3. Send any message to your bot to activate it
4. Get your chat ID: send message to bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Copy `chat.id` to `.env` as `TELEGRAM_CHAT_ID`

## Spam Filtering

Spam keywords are hardcoded in [src/db-local.ts](src/db-local.ts) (`BANNED_STRINGS`). Posts containing these keywords are filtered out before display.

## Security

The following files are gitignored to protect your data:
- `.env` — API keys
- `config/config.yaml` — personal interests and profile
- `data/*.db` — local database
- `data/*.csv` — exports

## License

Apache 2.0 — see [LICENSE](LICENSE).

Based on [python-repos](https://github.com/andreasjansson/python-repos) by Andreas Jansson / Replicate.