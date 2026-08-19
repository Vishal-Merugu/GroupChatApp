# Roadmap

Live tracker for build-plan position (spec section 12). Update this whenever a stage's status actually changes — check the filesystem, don't just mark it from memory.

## Phase 1 — Foundation rebuild

| Stage | Status | Notes |
| --- | --- | --- |
| A — TypeScript migration | ✅ done | `apps/server`, zero `any` |
| B — Real-time layer | ✅ done | Socket.io, tested with a real client |
| C — React frontend | ✅ done | `apps/web`, shared contracts |
| D — Repo health | ✅ done | Tests, README, Docker + Render deploy config. Not yet actually hosted. |

## Phase 2 — AI layer

| Stage | Status | Notes |
| --- | --- | --- |
| — Multi-provider credentials (BYOK) | ✅ done | Per-user encrypted API keys across providers (Gemini, Groq, OpenRouter, Cloudflare Workers AI, custom), priority-ordered waterfall via `FallbackProvider`, SSRF-guarded base URLs, settings UI, `POST /api/ai/ask` proof endpoint. 113 tests. Built and verified live 2026-08-17 — see `getProviderChainForUser` in `apps/server/src/modules/llm-credential/`. |
| E — Embedding pipeline | ⬜ not started | pgvector enabled in `docker-compose.yml`; nothing writes embeddings yet |
| F — Semantic search / agentic RAG | ⬜ not started | |
| G — Thread summarization | ⬜ not started | |
| H — Smart replies | ⬜ not started | |
| I — Tier 2 (optional) | ⬜ not started | Action items, translation, tone check |

Build order: E before F before G/H, per spec section 12, unless told otherwise.
