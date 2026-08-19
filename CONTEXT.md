# CONTEXT

Domain notes for GroupChat+AI. Architecture and rules live in `CLAUDE.md`; the full rationale lives in `GroupChatAI_Specification.docx`.

## What this is

A group chat application with an AI layer that is deliberately *not* "every message goes to an LLM". Two invocation models, built in this order:

- **On-demand (invoked)** — user asks explicitly (`@ai catch me up`, `@ai when did we decide on the venue`). Request/response, predictable, low volume. Tier 1.
- **Ambient (passive)** — system offers help unasked (smart replies, notification ranking). Runs continuously, needs far higher precision, because a wrong ambient suggestion erodes trust in a way a wrong on-demand answer does not. Tier 3, optional.

## Core entities

| Entity | Notes |
| --- | --- |
| `User` | Email is unique. `password` is a bcrypt hash and is never serialized — use `toPublicJSON()`. |
| `Group` | A chat room. Deleting one cascades to its messages and memberships. |
| `UserGroup` | Membership join table. **`isAdmin` is per-group**, not a user-level role. Defaults to `false`. |
| `Message` | Belongs to one user and one group. `body` is plain text. Attachments are structured fields (`kind`, `attachmentUrl`, `attachmentName`), never markup embedded in `body`. |
| `ForgotPasswordRequest` | UUID-keyed, single-use, one-hour expiry. Requesting a new one deactivates the previous. |

## Authorization model

There are exactly two levels, both enforced in `modules/group/membership.service.ts`:

- **Member** — can read history, post, join the socket room. `requireMembership`.
- **Group admin** — can rename the group, change membership, delete the group. `requireGroupAdmin`.

The group creator is always an admin. A group can never be left with zero admins.

Non-members get **404, not 403**, so group existence is not leaked.

## Why the rebuild

The original (`Backend/`) worked but had gaps that made an AI layer untenable on top of it. Recorded so they are not reintroduced:

- No real-time delivery at all — REST polling only. This was the actual foundational gap.
- No authorization anywhere. Any logged-in user could delete any group by id; message history had no auth middleware at all.
- Every error handled as `catch (err) { console.log(err) }` — requests hung until the client timed out instead of returning a status.
- `members.forEach(async ...)` with the response sent immediately — membership writes raced the response and errors vanished.
- Membership defaulted `isadmin: true`, making every added member an admin.
- JWTs signed with no expiry. Login leaked whether an email was registered.
- File shares stored as raw `<a href>` HTML in the message body, rendered with innerHTML, uploaded to S3 with `ACL: public-read`.
- MySQL, which cannot host pgvector (Decision 2) — hence Postgres.

## BYOK: bring-your-own-key across providers

Every AI feature runs against *the calling user's own* provider chain, not one fixed server key. A user adds their own API keys — Gemini, Groq, OpenRouter, Cloudflare Workers AI, or any custom OpenAI-compatible endpoint — in `AI Providers` settings, in a priority order. At call time (`getProviderChainForUser`) they're wrapped in a `FallbackProvider`: try the first, and on a rate-limit or outage fall through to the next, automatically. This is what makes several free-tier keys usable together without one provider's quota becoming a hard ceiling — the direct extension of Decision 5/7 to a multi-tenant, self-service setting rather than one operator-configured backend.

The operator's own `LLM_PROVIDER` env config is appended last, so a brand-new user with no keys yet still gets something (normally local Ollama) rather than a wall.

Every provider used here — even Gemini and Cloudflare — speaks the OpenAI chat-completions dialect, so `packages/llm` never grew a vendor SDK for any of them. Onboarding a new free-tier provider is a registry entry in `packages/llm/src/registry.ts`, not new code.

Since the server makes outbound HTTP requests to whatever base URL a user configures, every one goes through an SSRF guard (real DNS resolution, rejects private/loopback/link-local ranges) before it's ever saved — this is genuinely attacker-reachable input in a multi-tenant app, not a hypothetical.

## Retrieval design (Phase 2, not yet built)

Plain vector search fails on the queries a chat app actually receives: "what did we decide last week" needs a date filter, and dates are not semantically near the word "week". Hence **agentic RAG** (Decision 3) — the LLM parses the query into filters first, then structured SQL filtering combines with vector search.

The vector index lives in Postgres via pgvector (Decision 2), not a separate service. `docker-compose.yml` already runs a pgvector image and `scripts/init-db.sql` enables the extension, so Stage E needs no infrastructure change.

When a RAG answer is wrong, check what retrieval returned **before** blaming the model. Bad retrieval looks exactly like a bad model.

## Privacy boundary

The group tone signal (spec 6.3) is opt-in, admin-visible only, never about a named individual, and off by default. If in doubt, leave it out — it is not required for the project to be complete. Do not build any feature that surfaces one user's behaviour to another.
