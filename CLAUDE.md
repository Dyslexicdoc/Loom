# Loom — Project Guide (CLAUDE.md)

Local-first web UI for a local LLM. Next.js full-stack app, runs entirely on localhost. No cloud, no telemetry, no external accounts.

> Read `PLAN.md` for scope and phase sequencing. Work one phase at a time; stop at each checkpoint.

---

## Stack

- **Next.js (App Router) + TypeScript** (strict mode).
- **Tailwind CSS + shadcn/ui** — dark mode default.
- **Vercel AI SDK (`ai`)** — chat/agent streaming + tool calling, OpenAI-compatible provider.
- **React Flow (`@xyflow/react`)** + `dagre` — Canvas.
- **Drizzle ORM + better-sqlite3** — SQLite at `./data/loom.db`. Migrations via `drizzle-kit`.
- **`@modelcontextprotocol/sdk`** — MCP client (stdio + SSE/HTTP).
- **`sqlite-vec`** (or in-DB cosine fallback) — memory vector search.

## LLM connection

- OpenAI-compatible API via configurable **base URL** (stored in DB `settings`).
- Defaults: LM Studio `http://localhost:1234/v1`, dummy API key, model + embeddings model set in Settings.
- Switching to Ollama (`http://localhost:11434/v1`) must be a **base-URL change only** — no code changes.
- **Two local endpoints run side by side.** `llmBaseUrl` is the primary (LM Studio) and owns unprefixed model ids; `ollamaBaseUrl` is an optional second server whose models are addressed with an `ollama/` prefix. Empty `ollamaBaseUrl` = disabled. Resolve both through `parseModel` + `localEndpoint`/`localEndpoints` in `lib/provider.ts` — never read `llmBaseUrl` directly when a model string is in hand.
- Tool calling: Agents/Research/MCP require a tool-capable model. If the model lacks tool support, **warn clearly and degrade to plain chat** — never fail silently.

## Conventions

- App Router under `src/app`. Route handlers in `src/app/api/**/route.ts`.
- DB layer in `src/db` (schema, client, migrations). Repos/queries in `src/db/repos` or `src/lib/<domain>`.
- Shared types in `src/lib/types`. No `any`; avoid `unknown` / `Record<string, unknown>` as a substitute for real types.
- Early returns, flat code, small well-named helpers. Functional first.
- Single-word file names where possible; group related modules under a single-word directory.
- All user-facing strings live in components for now (no i18n layer yet — add only if needed).
- Server-only secrets/DB access never imported into client components (`server-only` guard where useful).

## Directory layout (target)

```
src/
  app/                 # routes: /(chat), /agents, /research, /canvas, /slides, /diagrams, /code, /memory, /settings
    api/               # route handlers (llm ping, chat, mcp, slides pptx export, etc.)
  components/          # shadcn ui + app components
  db/                  # schema.ts, client.ts, migrations/
  lib/                 # settings, llm client, mcp, search, memory, types
data/                  # loom.db (gitignored)
drizzle/               # generated migrations (or src/db/migrations)
```

## Run commands

| Command               | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `npm install`         | Install deps                               |
| `npm run dev`         | Next.js dev server (http://localhost:3000) |
| `npm run build`       | Production build                           |
| `npm run start`       | Run production build                       |
| `npm run lint`        | ESLint                                     |
| `npm run format`      | Prettier write                             |
| `npm run db:generate` | Generate Drizzle migration from schema     |
| `npm run db:migrate`  | Apply migrations to `./data/loom.db`       |
| `npm run db:studio`   | Drizzle Studio (inspect DB)                |

## AI SDK v6 notes (installed: `ai@6`, `@ai-sdk/react@3`)

- **Provider**: `createOpenAICompatible({ name, baseURL, apiKey })` → `provider.chatModel(id)` / `provider.embeddingModel(id)`. Built in `src/lib/provider.ts`.
- **Server**: `streamText({ model, system, messages: await convertToModelMessages(uiMessages), onFinish: ({ text }) => …, onError })` → `result.toUIMessageStreamResponse({ onError: (e) => string })`. `convertToModelMessages` is **async** — await it.
- **Client**: `useChat({ id, messages, transport: new DefaultChatTransport({ api, body }), onFinish })`. No `input`/`handleInputChange`/`handleSubmit` — keep input in local state and call `sendMessage({ text })`. Status is `'submitted' | 'streaming' | 'ready' | 'error'`. Returns `{ messages, sendMessage, status, stop, error, setMessages, regenerate }`.
- **Messages** are `UIMessage` with a `parts` array (`{ type: 'text', text }`, plus tool/reasoning parts later). Extract text by filtering `parts` (helper `textFromUIMessage`).

## shadcn = Base UI (not Radix)

This project's shadcn style is **base-nova**, backed by `@base-ui/react`. Triggers render a real element by default and use a **`render` prop** (not `asChild`); open state is exposed as **`data-[popup-open]`** (not `data-[state=open]`). `Select`'s `onValueChange` is `(value: string | null, details) => void`.

## Slides, Diagrams, and the Code Lab

These three share one habit: **the source of truth is text**, and everything else is derived from it on read.

- **Diagrams** are Mermaid `flowchart` source. `lib/diagram.ts` parses it, lays it out with dagre, and routes the edges; `lib/diagram-svg.ts` renders. There is no cached spec to invalidate.
- **Decks** are a Markdown outline. `lib/deck.ts` parses it into typed slides, inferring each slide's layout from its content. Adding a layout means teaching the parser a shape, the renderer a case, and `lib/pptx.ts` a case — in that order.
- **Snippets** are source plus JSON test cases, run in the browser.

Two rules keep these honest:

1. **One layout engine.** `routeDiagram` in `lib/diagram.ts` decides where every node and edge goes. The SVG renderer, the on-screen view, and the PowerPoint exporter all draw from its result — so an exported deck matches the screen instead of approximating it. Never compute positions anywhere else.
2. **Code never runs on the server.** `lib/code-runner.ts` builds a Blob Web Worker; HTML previews get an iframe with `allow-scripts` and nothing else. Keep it that way — the server has the user's database on it.

PowerPoint export (`lib/pptx.ts`) is server-only, because pptxgenjs needs a Node buffer. It emits native shapes, never images.

## Gotchas

- **Windows**: `better-sqlite3` is a native module — needs build tools; if install fails, ensure a recent MSVC/Python build chain or use prebuilt binaries (npm usually fetches prebuilt for Node 24).
- **`sqlite-vec` on Windows** may need manual extension loading; have the cosine fallback ready (decided in Phase 2).
- `./data/loom.db` is gitignored; migrations are committed.
- LM Studio must have a model **loaded** and the local server **started** for ping/chat to work.
- SearXNG must be configured to return JSON (`format=json` enabled in its settings) — see README.

## Testing

- Manual test steps are listed at the end of each phase in `PLAN.md` / phase summary.
- Add automated tests where they add value (DB repos, pure lib functions); not pursuing heavy coverage during scaffolding.
