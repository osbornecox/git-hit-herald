# Contributing to HypeSeeker

Thanks for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Copy config files:
   ```bash
   cp .env.example .env
   cp config/interests.example.yaml config/interests.yaml
   ```
5. Add your `ANTHROPIC_API_KEY` to `.env`

## Development

```bash
# Run update (fetch + score + enrich)
npm run update

# Export data
npm run export
```

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Test locally with `npm run update`
4. Submit a PR with a clear description

## What to Contribute

Ideas for contributions:

- **New sources** — add fetchers for other platforms (Twitter/X, ArXiv, etc.)
- **Better scoring** — improve LLM prompts for relevance scoring
- **UI improvements** — enhance the HTML template
- **Documentation** — improve README, add examples
- **Bug fixes** — if you find something broken

## Code Style

- TypeScript with strict mode
- Use existing patterns in the codebase
- Keep it simple

## Questions?

Open an issue if you have questions or want to discuss a feature before implementing.
