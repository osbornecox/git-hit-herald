# Changelog

## [Unreleased]

### Added
- Local development mode with SQLite storage (`src/db-local.ts`)
- LLM-based relevance scoring using Claude Haiku (`src/llm/scorer.ts`)
- LLM-based content enrichment with Russian summaries using Claude Sonnet (`src/llm/enricher.ts`)
- Personalized interest configuration via YAML (`config/interests.yaml`)
- Local entry point (`src/index-local.ts`) and scheduler (`src/scheduled-local.ts`)
- Data export functionality (`src/export.ts`)
- Local HTML template (`src/templates/page-local.html`)

### Changed
- Architecture shifted from Cloudflare-first to local-first
- Storage changed from Supabase to SQLite

## [0.0.0] - Fork baseline

Forked from [andreasjansson/python-repos](https://github.com/andreasjansson/python-repos) at commit `9a204ef`.

Original features:
- GitHub trending Python repos aggregation
- HuggingFace models integration
- Reddit posts from r/LocalLLaMA, r/MachineLearning, r/StableDiffusion
- Replicate models integration
- Cloudflare Workers deployment
- Supabase storage
