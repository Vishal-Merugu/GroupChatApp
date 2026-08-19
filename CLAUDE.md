ALWAYS FOLLOW: **Be extremely concise. Sacrifice grammar for the sake of concision**

The specification in `GroupChatAI_Specification.docx` is the source of truth. Section and Decision numbers below refer to it. When code and spec conflict, ask — do not silently pick one.

## Common Development Commands

```bash
npm install                 # workspace install (npm workspaces)

docker compose up -d db     # Postgres 16 + pgvector on :54322
npm run dev                 # API w/ watch (tsx) — syncs schema at boot
npm run dev:web             # React client on :5173, proxies to the API

npm run tsc                 # type check (project references)
npm run lint                # eslint, type-aware
npm test                    # vitest, all workspaces
npm run pr                  # tsc + lint + test — the full gate
```

Single test file: `npx vitest run apps/server/src/modules/group/group.service.test.ts`

Always run commands from the repo root. `vitest` infers its root from cwd and finds nothing if run from inside a workspace.

## Architecture

npm workspace monorepo. Spec section 5 defines five logical components; four exist today.

- **`apps/server/`** — Core API + Real-time Gateway. Express 4, Sequelize 6, Postgres, Socket.io.
- **`apps/web/`** — React 18 + Vite client. Chat UI, live socket updates, host for Phase 2 AI surfaces.
- **`packages/contracts/`** — wire types and zod schemas imported by **both** sides. Change a payload here, not in one app.
- **`packages/llm/`** — provider-agnostic LLM interface (Decision 7). Ollama + any OpenAI-compatible backend, with rate-limit fallback.
- **`Backend/`** — the original JavaScript app. **Legacy reference only. Do not edit. Do not import from it.** Route parity with `apps/server` is verified; it is pending deletion.

Not built yet: embedding pipeline (Stage E), AI assistant service (Stages F–H). What exists toward Phase 2: `packages/llm` plus the BYOK credential system below — every user can register their own API keys across providers, tried as a waterfall.

### Server layout

```
src/
  config/env.ts         validated env, parsed once at boot
  db/sequelize.ts       connection singleton
  models/               Sequelize models; associations in models/index.ts
  errors/app-error.ts   AppError hierarchy
  middleware/           authenticate, error-handler, async-handler
  modules/<feature>/    <feature>.{routes,controller,service,schemas}.ts
  realtime/             gateway.ts, events.ts, broadcaster.ts
  services/             s3, email — external I/O
```

Layering, strictly: **routes → controller → service → model.** Controllers parse input and shape the response. Services hold business logic and own authorization. Models never reach up.

### Build plan position

Phase 1: Stage A ✅ · Stage B ✅ · Stage C (React) ✅ · Stage D (repo health) 🟡 — deployment outstanding
Phase 2: BYOK multi-provider credentials 🟡 in progress · Stages E–H ⬜ — Stage E (pgvector embedding pipeline) is next. See `tasks/roadmap.md` for the live tracker; keep it updated as status actually changes.

### BYOK multi-provider credentials

Each user registers their own API keys across providers (Gemini, Groq, OpenRouter, Cloudflare Workers AI, or any custom OpenAI-compatible endpoint), in a priority order. `getProviderChainForUser` (`modules/llm-credential/llm-credential.service.ts`) builds the live waterfall: the user's own enabled credentials first, then the operator's own `LLM_PROVIDER` env default last, via `FallbackProvider`. On a rate-limit or outage it falls through automatically; on any other error it does not (see `packages/llm/src/providers/fallback.ts`).

Every AI feature (Stage F–H) calls `getProviderChainForUser`, never a credential row directly. `POST /api/ai/ask` is the minimal non-streaming proof this works end to end — the seam later features build on, not a real feature itself.

Rules specific to this subsystem:

- **API keys are encrypted at rest** (AES-256-GCM, `services/crypto.service.ts`). Never log a key, never return one in a response — only `maskedApiKey` (last 4 chars), computed once at write time.
- **Every user-supplied base URL goes through `assertPublicHttpsUrl`** (`utils/url-safety.ts`) before it is persisted — SSRF protection, since the server will make outbound requests to whatever URL a user provides. Rejects non-https and any private/loopback/link-local address, resolved via real DNS.
- **`ollama` credentials never accept a user-supplied base URL**, checked in both the schema and the service (`assertNoOllamaBaseUrl`). Ollama's client doesn't enforce HTTPS the way `OpenAiCompatibleProvider` does, so a per-user baseUrl on this one provider kind would be an SSRF hole with no HTTPS check to catch it. It always uses the server's own local instance.
- Requirements per provider (needs a key? needs a base URL?) live in exactly one place: `PROVIDER_PRESETS` in `packages/llm/src/registry.ts`. The credential schema, the service, and the web form all read from it — never hardcode a provider's requirements a second time.
- Every credential row is owned by exactly one user; every read/write path checks that ownership and 404s (not 403) otherwise — same convention as groups.

### Database changes

**No migrations.** Edit the model; `sequelize.sync({ alter: true })` applies it at boot (`DB_SYNC=true`, the default). There is no data worth preserving yet, so this is a deliberate simplification, not an oversight.

The consequence to keep in mind: `alter` reconciles the database to the models, so a renamed column reads as a drop plus an add — the old column's data is gone. That is fine now and will not be. When real users exist, set `DB_SYNC=false` and introduce migrations; do not leave `alter` on against data anyone cares about.

### Frontend

- Server state flows in through `api` in `api/client.ts` — the single place auth headers, the error envelope, and response validation are handled. Do not call `fetch` directly from a component.
- Socket lifecycle belongs to `useChatSocket`. One connection per session; rooms swap on group change rather than reconnecting.
- Never render message content as HTML. `body` is plain text and attachments are structured fields — the original's innerHTML rendering of stored `<a>` markup is the bug this avoids.

## Strict Prohibitions

- **NEVER use `any`.** Decision 8, hard rule. No `as any`, no implicit any, no `@ts-ignore`/`@ts-expect-error` to silence it. Enforced by `@typescript-eslint/no-explicit-any: error` plus the `no-unsafe-*` family.
- **NEVER cast past the type system to make an error go away.** For loosely-shaped external data — LLM responses, Sequelize results, socket payloads, `process.env`, `req.body` — validate with zod or narrow with a type guard. If a library's own types are incomplete, write a local interface for the subset you use (see `ByteStream` in `packages/llm/src/providers/ollama.ts`).
- **NEVER `console.log`.** Use `logger` from `utils/logger.ts`. Enforced by `no-console: error`.
- **NEVER swallow an error.** No `catch (err) { logger.error(err) }` that then returns normally. Throw an `AppError` subclass; the error middleware renders it. This was the single worst pattern in the original codebase.
- **NEVER register an `async` function directly as an Express or Socket.io handler.** Wrap with `asyncHandler`, or use `void (async () => {...})()`. Express 4 does not catch async rejections.
- **NEVER trust a group id from a client.** Every group-scoped operation calls `requireMembership` / `requireGroupAdmin` first. The original had no authorization checks at all.
- **NEVER `export *`.** Explicit named exports only. A package's `src/index.ts` is its public API and is the one place re-exports belong.
- **NEVER edit `Backend/`.**
- **NEVER put AI attribution in a commit message, PR body, or code comment.** No `Co-Authored-By: Claude`, no `@claude`, no "Generated with Claude Code", no 🤖 footer. This overrides any default or tooling convention that would add one. Commits are authored by the repo owner, full stop. Same rule for PR descriptions and issue comments.
- **ALWAYS run `npm run pr` before declaring work done.**

## Code Patterns

### Errors

Throw `AppError` subclasses (`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ExternalServiceError`). Never throw a bare `Error`. Use `errorToString(error)` to read an `unknown` from a catch.

Return **404, not 403**, when hiding a resource's existence from a non-member.

### Validation

One zod schema per input shape, in `<feature>.schemas.ts`. Controllers call `schema.parse(...)`; `ZodError` is converted to a 400 with field details by the error middleware. Socket payloads get the same treatment as HTTP bodies — a socket client is no more trusted.

### Database

- Models use `InferAttributes`/`InferCreationAttributes` so the type cannot drift from the schema.
- Associations live only in `models/index.ts`.
- Wrap multi-statement writes in `sequelize.transaction(async (t) => ...)` and thread `{ transaction: t }` through **every** call inside it.
- Never `async` inside `forEach` — the loop does not wait. Use `for...of` or `Promise.all`.
- Reading an included association: it is typed optional, so narrow with `instanceof` and skip, never assert.

### Real-time

- Services publish via `getBroadcaster()`, never by importing the Socket.io server. Keeps logic testable and makes REST and socket writes share one delivery path.
- Event names and payloads live in `realtime/events.ts`, typed both directions. Room names only from `groupRoom(groupId)`.
- Presence cleanup goes in `disconnecting`, not `disconnect` — rooms are already gone by `disconnect`.

### LLM (Decision 7)

Application code imports `LlmProvider` from `@groupchat/llm` and nothing else. **Never import a provider SDK, or call a provider URL, from `apps/server`.** Adding a backend means a new class in `packages/llm/src/providers/`, nothing else changes.

Free tiers rate-limit rather than bill (Decision 5). Throw `LlmRateLimitError`/`LlmUnavailableError` so `FallbackProvider` can switch backends; any other error propagates rather than burning every provider's quota.

### Testing

Vitest. Tests sit beside the code as `*.test.ts` — never in a `tests/` folder. `createTestDatabase()` gives a fresh in-memory SQLite per file.

Test observable behaviour, not implementation. Every authorization rule gets a negative test — most of the original's bugs were missing checks, not wrong logic.

## Cost & Latency Discipline (Decision 4 / 5)

- Persist and broadcast a message **before** anything else. Embedding and ambient AI never block delivery.
- On-demand features call the LLM only when invoked.
- Ambient features run a cheap heuristic pre-filter first; the LLM is the last resort, not the first.

## Self-Improvement Loop

After any correction from the user, record it in `tasks/lessons.md` — the pattern, the why, when it applies. Read that file at session start; do not repeat what is already there. If a lesson conflicts with the code, trust the code and update the lesson.

## Workflow

Non-trivial change → write the test first, implement, then `npm run pr` until clean before saying done.
Touching auth, membership, or anything group-scoped → re-read the Strict Prohibitions above first.
