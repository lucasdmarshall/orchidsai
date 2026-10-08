# orchid-api

Rust (Axum + SQLx) backend for the chat app, backed by PostgreSQL.
Migrations in `migrations/` run automatically on startup.

## Run locally

```bash
cp .env.example .env      # set DATABASE_URL and OPENROUTER_API_KEYS
cargo run
```

Then start the site from the repo root with `NEXT_PUBLIC_API_URL=http://localhost:8787 bun dev`.

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
