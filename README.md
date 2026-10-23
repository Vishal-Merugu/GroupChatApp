# GroupChatApp

A TypeScript rebuild of a group chat app, with real-time messaging and a provider-ready AI foundation. Messages are persisted by the Express API and delivered live through Socket.IO. The AI integration currently proves the provider and credential flow; semantic search, summaries, and smart replies remain future work.

## Implemented features

- Account signup/login, profile retrieval, and password reset.
- Create and manage groups, membership, and administrator roles.
- Persisted message history with cursor-based pagination.
- Real-time group messages, typing indicators, and presence.
- Structured attachment fields and an upload endpoint with a 10 MB cap; S3 settings are optional.
- Per-user LLM credentials, encrypted at rest with AES-256-GCM, masked in API responses, and tried in priority order.
- OpenAI-compatible providers, local Ollama, and fallback on rate limits or provider outages.
- A minimal authenticated ask endpoint that exercises the configured provider chain.

## Architecture

| Workspace | Stack | Responsibility |
| --- | --- | --- |
| apps/web | React 18, Vite, TypeScript | Chat UI, live updates, provider settings |
| apps/server | Express 4, TypeScript, Sequelize, Socket.IO | REST API, auth, group/message services, real-time gateway |
| Database | PostgreSQL with pgvector extension enabled | Relational data; vector search is not implemented yet |
| packages/contracts | TypeScript and Zod | Shared API and socket contracts |
| packages/llm | TypeScript | Provider interface, local Ollama, OpenAI-compatible backends, fallback chain |

The server authenticates sockets at connection time and checks group membership before joining a room. REST history and writes also require authentication and membership checks.

## Run locally

### Requirements

- Node.js 20+
- Docker Compose
- A local Ollama service or an LLM provider credential if you want to try the ask endpoint

~~~bash
cp .env.example .env
# Set JWT_SECRET_KEY and a base64-encoded 32-byte CREDENTIAL_ENCRYPTION_KEY.
npm install
docker compose up -d db
npm run dev
~~~

In another terminal, start the web client:

~~~bash
npm run dev:web
~~~

Open http://localhost:5173. Create two accounts, create a group with both users, and send messages to see live delivery.

The API defaults to port 3000. Local PostgreSQL is exposed on port 54322. S3-compatible attachment storage is only needed when using the attachment upload feature.

## Common commands

~~~bash
npm run tsc
npm run lint
npm test
npm run pr
~~~

The test suite uses in-memory SQLite for many service and HTTP checks; the full application uses PostgreSQL. No test counts or performance figures are claimed here.

## AI provider setup

Users can save provider credentials from the app. Keys are encrypted before storage and only a masked preview is returned. A custom remote provider URL must pass the server’s public HTTPS/SSRF checks. Local Ollama uses the server-side configuration.

The /api/ai/ask route is a wiring check, not a chat assistant feature. Search, summarization, and smart replies are not implemented yet.

## Known limitations

- Database schema changes currently use Sequelize sync with alter enabled by default. This is suitable only while there is no production data; introduce migrations before real users.
- Access tokens last seven days and are stored in browser localStorage; there is no refresh-token flow.
- pgvector is enabled in the local database image, but no embedding or vector-search feature is implemented.
- The legacy JavaScript/MySQL application is retained under Backend/ as a reference. The maintained TypeScript rebuild is under apps/ and packages/.
- The project is a deployable demo blueprint, not a currently hosted service.
