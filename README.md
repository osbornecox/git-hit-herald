# HypeSeeker

**Your personal AI news radar.**

Define your interests once — get a daily feed of trending ML/AI posts tailored specifically for you. HypeSeeker scans GitHub, HuggingFace, Reddit, and Replicate, then uses an LLM to score each post against your profile. Only the most relevant stuff reaches your Telegram — no noise, no FOMO.

## How It Works

1. **You define your interests** in a simple YAML config (topics you care about, topics to ignore)
2. **HypeSeeker fetches** fresh posts from multiple sources (new repos, trending models, hot discussions)
3. **LLM scores each post** against your profile — high relevance gets high score
4. **Top posts get summaries** written by a smarter model, explaining why they matter to you
5. **Digest lands in Telegram** — only posts above your threshold, ready to read

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

# Telegram (optional - for Telegram delivery)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Slack (optional - for Slack delivery)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### config/config.yaml

```yaml
# Language for summaries
# Format: ISO 639-1 code (en, ru, de, fr, es, zh, ja, etc.)
language: en

# Minimum score (0-100) for Telegram digest and enrichment
min_score_for_digest: 70

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
    # Optional: filter by flair (only include posts with these flairs)
    # flair_filters:
    #   machinelearning:
    #     - Research
    #     - Project
  huggingface:
    min_likes: 5
    min_downloads: 1
  replicate:
    min_runs: 10
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run update` | Full pipeline: fetch → score → enrich → export → send |
| `npm run daemon` | Start built-in scheduler (runs at configured times) |
| `npm run telegram` | Send current digest to Telegram (no fetch/score) |
| `npm run slack` | Send current digest to Slack (no fetch/score) |
| `npm run export` | Export database to CSV |

## Scheduled Runs

### Option 1: Built-in Daemon (Recommended)

Works on all platforms (macOS, Linux, Windows). Configure times in `config.yaml`:

```yaml
schedule:
  enabled: true
  times:
    - "09:00"
    - "18:00"
  timezone: "America/New_York"  # optional, defaults to system
```

Then run:

```bash
npm run daemon
```

The daemon will run in foreground and execute updates at configured times. Use `Ctrl+C` to stop.

To run in background:
- **macOS/Linux:** `nohup npm run daemon > daemon.log 2>&1 &`
- **Windows:** Use `start /B npm run daemon` or run as a Windows Service

### Option 2: System Scheduler

#### macOS (launchd)

```bash
cp com.hypeseeker.update.plist.example com.hypeseeker.update.plist
# Edit paths in plist file
cp com.hypeseeker.update.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.hypeseeker.update.plist
```

#### Linux (cron)

```bash
crontab -e
# Add: 0 9,18 * * * cd /path/to/hypeseeker && npm run update
```

#### Windows (Task Scheduler)

1. Open Task Scheduler → Create Basic Task
2. Set trigger: Daily at your preferred time
3. Set action: Start a program
   - Program: `npm`
   - Arguments: `run update`
   - Start in: `C:\path\to\hypeseeker`

## Pipeline

The update pipeline runs 8 steps:

1. **Fetch** — Get posts from GitHub, HuggingFace, Reddit, Replicate
2. **Save** — Store in SQLite database
3. **README Fetch** — Get README for GitHub repos with short descriptions
4. **Score** — LLM evaluates relevance (0-100%) based on your interests
5. **Enrich** — LLM writes summaries for top posts (score >= `min_score_for_digest`)
6. **Export** — Save to CSV (data/feed.csv)
7. **Telegram** — Send digest to Telegram (if configured)
8. **Slack** — Send digest to Slack (if configured)

## Output Formats

| Format | Location | Description |
|--------|----------|-------------|
| Telegram | Your bot | Daily digest with top posts (if `TELEGRAM_*` configured) |
| Slack | Your channel | Daily digest with top posts (if `SLACK_WEBHOOK_URL` configured) |
| CSV | `data/feed.csv` | Backup export — all posts with scores |
| SQLite | `data/posts.db` | Raw database |

## Project Structure

```
src/
├── scheduled-local.ts  # Update orchestration
├── daemon.ts           # Built-in scheduler
├── db-local.ts         # SQLite storage
├── fetchers.ts         # Data fetchers (GitHub, Reddit, HF, Replicate)
├── telegram.ts         # Telegram bot integration
├── slack.ts            # Slack webhook integration
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
| `openai` (default) | gpt-4.1-mini | gpt-5-mini |
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

## Slack Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → "From scratch"
2. Enter app name (e.g., "HypeSeeker") and select your workspace
3. In the left menu: **Incoming Webhooks** → Enable the toggle
4. Click **Add New Webhook to Workspace** → Select a channel
5. Copy the Webhook URL to `.env` as `SLACK_WEBHOOK_URL`

You can use both Telegram and Slack simultaneously — each has independent tracking of sent posts.

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