# HypeSeeker — Project Rules

## Language

- All code, comments, and documentation must be in **English**
- Variable names, function names, and strings in code — English only
- README, NOTICE, and other docs — English only

## Security & Privacy

The following files contain personal data and API keys. They are gitignored and must **never** be committed:

- `.env` — API keys (OpenAI, Anthropic, Telegram, GitHub)
- `config/config.yaml` — personal interests, profile, preferences
- `data/*.db` — local database with fetched posts
- `data/*.csv` — exported data
- `data/*.log` — execution logs
- `com.hypeseeker.update.plist` — launchd config with absolute paths

## Project Structure

```
src/
├── scheduled-local.ts  # Main pipeline orchestration
├── db-local.ts         # SQLite storage layer
├── fetchers.ts         # Data fetchers (GitHub, HF, Reddit, Replicate)
├── telegram.ts         # Telegram bot integration
├── readme-fetcher.ts   # GitHub README fetcher
├── export.ts           # CSV export
├── types.ts            # TypeScript interfaces
├── utils.ts            # Utility functions
└── llm/
    ├── client.ts       # LLM API client (OpenAI/Anthropic)
    ├── scorer.ts       # Relevance scoring
    ├── enricher.ts     # Summary generation
    └── prompts/        # LLM prompt templates (Markdown)
```

## Code Style

- TypeScript with ES modules (`"type": "module"`)
- No semicolons (project uses Prettier defaults)
- Use tabs for indentation
- Prefer `const` over `let`
- Use async/await, not callbacks

## Adding New Features

1. If adding a new source — add fetcher in `fetchers.ts`, update types in `types.ts`
2. If adding new config options — update `types.ts` (Config interface) and `config.example.yaml`
3. If changing LLM prompts — edit files in `src/llm/prompts/`

## Running the Project

```bash
npm install           # Install dependencies
npm run update        # Full pipeline: fetch → score → enrich → telegram
npm run telegram      # Send digest only (no fetch)
npm run export        # Export to CSV only
```
