# Lessons

Accumulated, versioned knowledge. Read at session start. Add to it after any correction — the pattern, the why, and when it applies. If a lesson conflicts with the code, trust the code and update the lesson.

---

## A conditional zod `.superRefine()` doesn't reach the service layer

`createLlmCredentialSchema` enforces "groq requires an API key" via `.superRefine()`, but that only runs on `.parse()` in the controller. The service function's TypeScript parameter type still marks `apiKey` optional (it's `z.infer` of an optional field), so calling the service directly with a hosted provider and no key compiled fine and silently persisted a broken credential. Caught by a test that called the service directly rather than going through the controller.

**Fix:** re-check the same requirement inside the service (`assertProviderRequirementsMet`), not only in the schema. **When:** any zod schema whose required-ness of a field is conditional (`superRefine`, `refine`) rather than expressed in the type itself — the type is not the enforcement.

## SSRF checks must cover every provider kind uniformly, not just the "custom" ones

The SSRF guard was written for user-supplied base URLs on `custom`/`cloudflare`. It was easy to assume `ollama` didn't need it since its base URL defaults to localhost — but that reasoning is backwards: `OllamaProvider` doesn't enforce HTTPS (localhost:11434 in plain HTTP is the normal case), so if a per-user baseUrl were ever accepted for it, that would be an SSRF hole with *no* HTTPS check to catch it, worse than the providers the guard was built for. Found by reasoning through a live verification plan before running it, not by a test.

**Fix:** `ollama` credentials never accept a user-supplied baseUrl at all — checked in the schema AND the service (`assertNoOllamaBaseUrl`), since the schema's per-field check doesn't reach the service either (see above). **When:** adding any provider kind whose client library has different transport requirements (HTTP vs HTTPS) from the others behind the same guard.

## An error class from a shared package isn't automatically an `AppError`

`LlmError` (from `@groupchat/llm`) extends plain `Error`, not this app's `AppError`. Thrown from a controller, it fell through `error-handler.ts`'s `normalize()` to a generic 500 "unexpected error" instead of the more accurate 502 "upstream service failed" — technically safe, but wrong and unhelpful for debugging. Caught by a test asserting the actual status code rather than just "some 4xx/5xx".

**Fix:** `normalize()` now maps `LlmError` → `ExternalServiceError` (502) explicitly. **When:** importing any error type from a workspace package — check whether the app's error middleware knows about it, don't assume every thrown error ends up correctly classified.

## A live end-to-end check catches what unit tests structurally can't

Two tiny local HTTP servers (one hardcoded to 429, one healthy) plus real credential rows in a real Postgres database proved the waterfall actually falls through under a real HTTP call — something 27 passing unit tests with mocked providers technically already covered in isolation, but hadn't proven wired together through the real DB → decrypt → chain-build → HTTP path. Worth doing for any feature where "does the whole pipe actually connect" is the real question, not "is each unit correct".

---

## Run commands from the repo root

`vitest` derives its root from the current working directory. Run it from inside `apps/server` and it reports "No test files found" while exiting 1 — which reads like a broken config rather than a wrong cwd.

**When:** any `npm test` / `npx vitest` invocation. Also note that `cd` persists across shell calls in a session.

## Schema is synced from models — there are no migrations

Decided deliberately: no production data exists, so `sequelize.sync({ alter: true })` at boot (`DB_SYNC=true`) is the whole workflow. Change a model, restart, done.

**The catch to remember:** `alter` reconciles the database to the models, so a renamed column is a drop plus an add and its data is gone. Harmless now. Before there are real users, set `DB_SYNC=false` and add migrations — do not leave `alter` running against data anyone cares about.

**Do not reintroduce migrations without being asked.** They were built and then removed on purpose.

## A CommonJS workspace package cannot be bundled by Rollup for the browser

`packages/contracts` builds to CommonJS for the server. The Vite build of `apps/web` then failed with "authResponseSchema is not exported by ..." — Rollup cannot statically resolve named exports out of CJS.

**Fix used:** a `resolve.alias` in `vite.config.ts` pointing `@groupchat/contracts` at its TypeScript source. Simpler than a dual CJS/ESM build, and it removes the need to rebuild the package between edits. The alias must be kept in step with the package name if it ever changes.

**When:** any new shared package that both the server and the web client import.

## Type-aware lint needs one program per environment

A single `tsconfig.lint.json` covering both server and browser code left `document`, `window`, and `setTimeout` unresolved in the React files, which surfaced as a wave of confusing `no-unsafe-*` errors ("error typed value") rather than an honest "cannot find name". Browser code lints against `apps/web/tsconfig.lint.json` (DOM lib + JSX); everything else against the root one.

**Symptom to recognise:** `no-unsafe-call` / `no-unsafe-member-access` on standard globals means a missing lib, not a real typing problem.

## `GID` is reserved in zsh

`GGID=$(...)` style assignment to `GID` in a zsh script fails with "failed to change group ID: operation not permitted". Use a different variable name in shell snippets.

## Do not compose zod schemas across a package boundary

`apps/server` merging a schema exported by `@groupchat/llm` worked under `node` but failed under `vitest`, which resolves the workspace package differently and ends up with two zod instances. The merged object silently became strict and rejected every unrelated environment variable — with a confusing "Expected never, received string" per key.

**Why it matters beyond the bug:** reading and validating configuration is the application's job, not a library's. The package now exports a plain `LlmConfig` interface and the server owns the schema.

**When:** exporting anything from `packages/*` that the server composes with. Export types and plain data; keep schema construction on one side.

## `zod` v3.25 is not the v3 you remember

The installed `zod` resolves to 3.25.x, which carries v4 internals. `.merge()`, `.strict()`, and error shapes behave differently from older 3.x. Verify behaviour with a quick `node -e` rather than assuming.

## Sequelize associations are typed optional — narrow, never assert

`message.get('user')` is `User | undefined` even with `required: true` on the include. Use `instanceof` and `flatMap` to skip, rather than a non-null assertion — `!` is banned here and the optionality is real if the include is ever changed.

## Express 4 does not catch async rejections

Registering an `async` function directly as a route or middleware means a rejection is unhandled and can take the process down; the original codebase's version of this left requests hanging until the client timed out. Everything goes through `asyncHandler`, which accepts sync or async handlers. Socket.io has the same problem — use `void (async () => {...})()`.

**Caught by:** `@typescript-eslint/no-misused-promises`. Do not disable it.

## Check authorization before side effects, not just before the write

The attachment upload originally called `createMessage` (which checks membership) only *after* pushing the file to S3 — so a non-member could write objects into the bucket and only then be rejected. The check has to precede every side effect, not merely the database write.

**When:** any handler that touches S3, email, or an external service before its final write.

## Narrow from `unknown`, not from an `any`-parameterised type

A type guard applied to `response.body` (typed `ReadableStream<any>`) only *intersects* with the existing type, so chunks stayed `any` and the `no-unsafe-*` rules still fired. Assigning to `const body: unknown` first makes the guard the sole source of the type.

**When:** narrowing anything from a library whose generics resolve to `any`.

## Prefer dropping a dependency to overriding its transitive deps

Native `bcrypt` pulls `@mapbox/node-pre-gyp` → vulnerable `tar` (2 critical, 2 high). npm `overrides` did not resolve it cleanly. Swapping to `bcryptjs` — same algorithm, same hash format, no native build — removed the whole chain.

Also: do not force an override that the dependent cannot use. Overriding sequelize's `uuid@8` to `uuid@11` would break it, because v11 is ESM-only and sequelize v6 is CommonJS. That one advisory is knowingly accepted; it affects only uuid v3/v5/v6 called with an explicit `buf`, which sequelize does not do.
