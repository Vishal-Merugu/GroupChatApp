# GroupChat + AI

A real-time group chat application in TypeScript, built as the foundation for an AI layer that is deliberately *not* "send every message to an LLM".

This is a full rebuild of [the original GroupChatApp](https://github.com/Vishal-Merugu/GroupChatApp) (Express/JavaScript/MySQL, REST-only). The original still lives in [`Backend/`](Backend/) as a read-only reference for the migration; the rebuild is in [`apps/server/`](apps/server/).

## Status

| Stage | | |
| --- | --- | --- |
| A — TypeScript migration | ✅ | Express + Sequelize on Postgres, fully typed, zero `any` |
| B — Real-time layer | ✅ | Socket.io rooms, live delivery, typing, presence |
| C — React frontend | ✅ | React 18 + Vite, live chat UI on shared typed contracts |
| D — Repo health | ✅ | 113 tests, README, Docker + Render blueprint — ready to deploy |
| BYOK multi-provider credentials | ✅ | Per-user encrypted API keys, priority-ordered waterfall — see below |
| E–H — AI layer | ⬜ | Credential system built; pipeline and features (search, summaries, replies) pending |

## Architecture

```
  ┌───────────────┐   REST (auth, history)   ┌──────────────────────────────┐
  │  apps/web     │─────────────────────────▶│  Core API      Express 4     │
  │  React 18     │                          │                Sequelize 6   │──▶ PostgreSQL
  │  Vite         │◀────────────────────────▶│                              │    + pgvector
  │               │   WebSocket (live msgs,  ├──────────────────────────────┤
  └───────────────┘   typing, presence)      │  Real-time Gateway           │
          │                                  │  Socket.io — room per group  │──▶ S3
          │  both import                     └──────────────┬───────────────┘
          ▼                                                 │ broadcaster seam
  ┌────────────────────────┐                                ▼
  │ @groupchat/contracts   │                 ┌──────────────────────────────┐
  │ shared wire types +    │                 │  @groupchat/llm              │──▶ Ollama (local)
  │ zod schemas            │                 │  provider-agnostic interface │──▶ Groq / OpenRouter
  └────────────────────────┘                 └──────────────────────────────┘    (free tier)
```

Both write paths — REST and socket — go through one `Broadcaster` seam, so a message posted over HTTP reaches live clients identically to one sent over the socket. Services never import Socket.io.

Client and server both import `@groupchat/contracts`, so a payload change breaks compilation on whichever side didn't follow, instead of surfacing as an empty field at runtime. The client validates every response against the same zod schemas.

### Workspaces

| Package | Purpose |
| --- | --- |
| `apps/server` | Core API and real-time gateway |
| `apps/web` | React client — chat UI, live updates, AI provider settings |
| `packages/contracts` | Wire types and zod schemas shared by client and server |
| `packages/llm` | LLM provider interface — Ollama and any OpenAI-compatible backend, with waterfall fallback |

## Getting started

Requires Node 20+ and Docker.

```bash
cp .env.example .env      # set JWT_SECRET_KEY to something long
npm install
docker compose up -d db   # Postgres 16 + pgvector on :54322
npm run dev               # API on http://localhost:3000 (creates the schema)
npm run dev:web           # UI  on http://localhost:5173
```

Open http://localhost:5173, sign up in two browsers, create a group with both addresses, and messages appear live in both.

### Commands

```bash
npm run dev      # API in watch mode
npm run dev:web  # React client (proxies /api and /socket.io to the API)
npm run tsc      # type check
npm run lint     # eslint, type-aware
npm test         # vitest
npm run pr       # all three — the gate before any commit
```

Tests run against in-memory SQLite, so no database is needed to run the suite.

### Schema changes

There are no migrations. The schema is applied straight from the Sequelize models at boot via `sync({ alter: true })`, so changing a model and restarting is the whole workflow. This is a deliberate choice for the current stage — there is no data worth preserving — and the trade-off is explicit: `alter` reconciles the database to the models, so a renamed column is a drop plus an add and its data is lost. Set `DB_SYNC=false` and introduce migrations before there are real users.

## API

All routes are under `/api`. Authenticate with `Authorization: Bearer <token>`.

| Method | Route | |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | returns a token |
| `POST` | `/api/auth/login` | returns a token |
| `GET` | `/api/auth/me` | current user |
| `POST` | `/api/password/forgot` | emails a single-use, 1-hour link |
| `POST` | `/api/password/reset` | consumes the token |
| `GET` `POST` | `/api/groups` | list / create |
| `GET` `PUT` `DELETE` | `/api/groups/:groupId` | detail / update / delete (admin) |
| `GET` `POST` | `/api/groups/:groupId/messages` | history (cursor: `?afterId=`) / send |
| `POST` | `/api/groups/:groupId/messages/attachments` | multipart, 10 MB cap |
| `GET` `POST` | `/api/llm-credentials` | list / add an AI provider credential |
| `PUT` `DELETE` | `/api/llm-credentials/:id` | update (rotate key, rename, enable/disable) / remove |
| `POST` | `/api/llm-credentials/reorder` | set waterfall priority order |
| `POST` | `/api/llm-credentials/:id/test` | verify one credential actually answers |
| `POST` | `/api/ai/ask` | proof-of-wiring: answers via the caller's provider waterfall |

### Socket events

Authenticate in the handshake: `io(url, { auth: { token } })`.

| Direction | Event | |
| --- | --- | --- |
| → | `group:join` / `group:leave` | membership verified on join |
| → | `message:send` | acked with the persisted message |
| → | `typing:start` / `typing:stop` | |
| ← | `message:new` | |
| ← | `typing:start` / `typing:stop` | |
| ← | `presence:join` / `presence:leave` | |

## AI providers (bring your own key)

Every user can register their own API keys across providers — Gemini, Groq, OpenRouter, Cloudflare Workers AI, or any custom OpenAI-compatible endpoint — from **AI Providers** in the app. They're tried in priority order at request time: if one is rate-limited or down, the request automatically falls through to the next, all the way down to the server's own default (normally local Ollama) so a brand-new user with no keys yet still gets an answer.

This is a direct extension of Decision 5/7 (free-tier resilience) into a self-service, multi-tenant setting rather than one operator-configured backend — the whole point being that several free-tier keys, none individually reliable under load, become one dependable service together.

Every provider listed speaks the OpenAI chat-completions dialect, so none of them needed a vendor SDK — onboarding a new one is a base-URL entry in `packages/llm/src/registry.ts`. API keys are encrypted at rest (AES-256-GCM) and never returned by the API, only a masked `••••1234` preview. Any user-supplied base URL is checked against an SSRF guard (rejects non-https and private/loopback/link-local addresses via real DNS resolution) before it's ever saved — the server will make outbound requests to whatever URL a user configures, so that's genuinely attacker-reachable input, not a hypothetical.

`POST /api/ai/ask` is a minimal proof this wiring works end to end; it is not itself an AI feature. Stages F–H (semantic search, summarization, smart replies) will call the same `getProviderChainForUser` seam.

## Deployment

The API also serves the built React client, so the whole thing ships as **one service** — which is what free tiers give you.

```bash
docker build -t groupchat-ai .
docker run -p 3000:3000 --env-file .env groupchat-ai
```

`render.yaml` is a Render blueprint (free tier, no credit card): push to GitHub, then **New → Blueprint** and pick the repo. It provisions a free Postgres 16, generates `JWT_SECRET_KEY`, and wires the database credentials and `APP_BASE_URL` automatically.

Any Docker host works the same way — the image needs `DB_*`, `JWT_SECRET_KEY`, and `APP_BASE_URL`. Set `DB_SSL=true` for managed Postgres (Render, Neon, Supabase); leave it off for local Docker.

## Design decisions

**Postgres, not MySQL.** The vector index for semantic search lives in the primary database via pgvector rather than in a separate vector service. That is a defensible choice at this data volume and removes an entire operational surface — but it does require Postgres, which is why the database changed.

**No provider SDK is imported by application code.** Every LLM-touching feature is written against a small interface (`LlmProvider`) implemented once per backend. This is not architecture for its own sake: the project runs on free tiers and local inference, and free tiers rotate their models and rate limits without notice. Local Ollama is the development default; each user's own hosted keys back the deployed demo, and `FallbackProvider` switches automatically when one is throttled — see "AI providers" above.

**Ollama never accepts a user-supplied base URL.** Every other provider's base URL is checked against an SSRF guard (HTTPS required, private/loopback ranges rejected). Ollama is exempt from that HTTPS requirement by design — `localhost:11434` in plain HTTP is the normal case — which means a per-user base URL on that one provider kind would route straight around the guard. So it's disallowed entirely, checked in both the request schema and the service layer, rather than partially protected.

**Delivery is never blocked by AI.** Messages are persisted and broadcast first. Embedding and any ambient analysis hang off that point, asynchronously. Semantic search lagging live chat by a few seconds is acceptable; delayed message delivery is not.

**No `any`, enforced by tooling.** `strict` + `noImplicitAny` in tsconfig, and `@typescript-eslint/no-explicit-any` as an *error* alongside the `no-unsafe-*` family. External boundaries — LLM responses, socket payloads, request bodies, environment — are validated with zod or narrowed with type guards. The AI code is the newest and least-proven part of the system, which is exactly where type safety pays for itself.

## What the rebuild fixed

The original worked, but the gaps below made an AI layer untenable on top of it. Listed plainly, because the migration story is part of the point:

- **No real-time delivery.** REST polling only — the actual foundational gap.
- **No authorization anywhere.** Any logged-in user could delete any group by id; message history had no auth middleware at all.
- **Errors swallowed.** `catch (err) { console.log(err) }` throughout, so failed requests hung until the client timed out instead of returning a status.
- **Races on write.** `members.forEach(async ...)` with the response sent immediately — membership inserts raced the response and errors vanished.
- **Everyone was an admin.** Membership defaulted `isadmin: true`.
- **Auth weaknesses.** JWTs never expired; login distinguished "no such user" from "wrong password", enabling account enumeration.
- **Unsafe file sharing.** Attachments stored as raw `<a href>` HTML in the message body and rendered with innerHTML, uploaded with `ACL: public-read`.
- **Silent truncation.** Message bodies were `VARCHAR(255)`.

Each of these has a regression test.

## Testing

113 tests across service logic, the HTTP surface (supertest), the socket gateway (a real client against a real server), and the credential/SSRF/encryption layer. Every authorization rule has a negative test asserting the denial — the original's bugs were missing checks, not wrong logic.

The provider waterfall specifically was verified live, not just unit-tested: two local mock OpenAI-compatible servers (one always returning 429, one healthy) were registered as real credentials against a real Postgres database, and `POST /api/ai/ask` was confirmed to hit the rate-limited one, fall through automatically, and answer from the healthy one — with both mock servers' own request logs confirming the sequence.

```bash
npm test
```

Beyond the suite, the stack has been driven end-to-end against a real PostgreSQL instance: schema created from an empty database, two accounts signed up, a group created, messages delivered live between two websocket clients, typing indicators forwarded, a REST-posted message pushed to socket clients, and every authorization denial confirmed by status code. The production build was then verified in its deployed shape — one service serving both the API and the built client, restarted against an existing database to confirm data survives.

## Known limitations

- **No migrations.** Schema comes from `sync({ alter: true })`. Deliberate while there is no data (see above), but it must change before real users exist.
- **Not yet live.** The Docker image and Render blueprint are ready and verified locally in their deployed shape, but nothing is hosted yet.
- Verified against PostgreSQL 14 locally; `docker-compose.yml` and the Render blueprint pin 16. The pgvector extension itself is unused until Stage E.
- One accepted advisory: sequelize v6 pins `uuid@8`. Forcing v11 would break it (ESM-only vs CommonJS). The advisory affects only uuid v3/v5/v6 called with an explicit `buf`, which sequelize does not do.
- No refresh-token flow; the access token is long-lived (7 days) and kept in `localStorage`. Acceptable for a demo, worth revisiting before real use.
- The tone-signal feature (spec 6.3) is deliberately unbuilt — opt-in, admin-only, and explicitly optional. It is not required for this project to be complete.
