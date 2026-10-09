# orchid-api

Rust (Axum + SQLx) backend for the chat app, backed by PostgreSQL.
Migrations in `migrations/` run automatically on startup.

## Run locally

```bash
cp .env.example .env      # set DATABASE_URL and OPENROUTER_API_KEYS
cargo run
```

Then start the site from the repo root with `NEXT_PUBLIC_API_URL=http://localhost:8787 bun dev`.

## OpenRouter keys

Keys live in the `api_keys` table. Each chat request uses a random active key
that no other request is using at the moment (and not the same one as the
previous request). Rate-limited keys rest for a minute, keys out of credit for
an hour, and keys OpenRouter rejects are switched off.

```bash
./target/release/orchid-api import-keys /root/openrouter-keys.csv   # CSV export or one key per line
```

Keys in `OPENROUTER_API_KEYS` are also added on startup.

## Chat context and memory

For each message the API builds the context itself from the database
(`src/memory.rs`): the chat's memory summary, the speakers of recent scenes
(at most 12), and as many recent messages as fit in `HISTORY_TOKEN_BUDGET`
(default 12000). When a chat outgrows the budget, the oldest messages are
folded into the summary by one background AI call, keeping 60% of the budget
as verbatim history so this only happens every few turns. The summary is
capped at ~350 words and its cast list drops characters who no longer matter.

## Importing from Supabase

```bash
./target/release/orchid-api import-supabase https://<project>.supabase.co <anon-key>
```

Copies tags, characters, personas, chats and messages, keeping their ids. Safe to re-run.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | |
| GET | `/api/tags` | |
| GET, POST | `/api/characters` | list takes `page`, `limit`, `rating`, `search`, `tag` (slug) |
| GET, PATCH, DELETE | `/api/characters/{id}` | delete also removes its chats |
| GET, POST | `/api/personas` | |
| PATCH, DELETE | `/api/personas/{id}` | |
| POST | `/api/personas/{id}/default` | `{ "is_default": bool }` |
| GET, POST | `/api/chats` | POST takes `character_id`, `persona_id`, `reuse_latest`, `greeting` |
| DELETE | `/api/chats/{id}` | |
| GET, POST | `/api/chats/{id}/messages` | |
| GET, PUT | `/api/settings` | |
| POST | `/api/chat` | streams the AI reply as newline-delimited JSON |
