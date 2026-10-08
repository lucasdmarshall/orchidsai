//! One-off command-line imports:
//!   orchid-api import-keys <file.csv|file.txt>
//!   orchid-api import-supabase <supabase-url> <anon-key>

use std::collections::HashMap;

use anyhow::{bail, Context};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::keys::KeyPool;

/// Adds every OpenRouter key (`sk-or-...`) found in the file to the pool.
/// Works with a CSV export or a plain list, one key per line.
pub async fn import_keys(db: &PgPool, path: &str) -> anyhow::Result<()> {
    let text = std::fs::read_to_string(path).with_context(|| format!("cannot read {path}"))?;
    let keys: Vec<String> = text
        .split(|c: char| c == ',' || c == ';' || c == '"' || c.is_whitespace())
        .filter(|field| field.starts_with("sk-or-"))
        .map(String::from)
        .collect();
    if keys.is_empty() {
        bail!("no OpenRouter keys (starting with sk-or-) found in {path}");
    }
    let added = KeyPool::add_keys(db, &keys).await?;
    let total: i64 = sqlx::query_scalar("SELECT count(*) FROM api_keys WHERE is_active").fetch_one(db).await?;
    println!("Found {} keys, added {added} new. Active keys in pool: {total}.", keys.len());
    Ok(())
}

struct Supabase {
    http: reqwest::Client,
    url: String,
    key: String,
}

impl Supabase {
    /// Reads a whole table through the Supabase REST API, 1000 rows at a time.
    /// Returns an empty list when the table does not exist.
    async fn table(&self, table: &str, order: &str) -> anyhow::Result<Vec<Value>> {
        let mut rows = Vec::new();
        loop {
            let res = self
                .http
                .get(format!("{}/rest/v1/{table}", self.url))
                .query(&[("select", "*"), ("order", order), ("offset", &rows.len().to_string()), ("limit", "1000")])
                .header("apikey", &self.key)
                .bearer_auth(&self.key)
                .send()
                .await?;
            if res.status() == reqwest::StatusCode::NOT_FOUND {
                println!("  {table}: not found in Supabase, skipping");
                return Ok(rows);
            }
            if !res.status().is_success() {
                bail!("reading {table} failed: {} {}", res.status(), res.text().await.unwrap_or_default());
            }
            let page: Vec<Value> = res.json().await?;
            let done = page.len() < 1000;
            rows.extend(page);
            if done {
                return Ok(rows);
            }
        }
    }
}

fn text(row: &Value, field: &str) -> String {
    row[field].as_str().unwrap_or("").to_string()
}

fn uuid(row: &Value, field: &str) -> Option<Uuid> {
    row[field].as_str().and_then(|s| s.parse().ok())
}

fn timestamp(row: &Value, field: &str) -> Option<String> {
    row[field].as_str().map(String::from)
}

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Copies tags, characters, personas, chats and messages from the old
/// Supabase project, keeping their ids. Safe to run again: rows that already
/// exist are skipped.
pub async fn import_supabase(db: &PgPool, url: &str, key: &str) -> anyhow::Result<()> {
    let sb = Supabase { http: reqwest::Client::new(), url: url.trim_end_matches('/').to_string(), key: key.to_string() };

    // Tags are matched by slug, since the new database already has some.
    let mut tag_ids: HashMap<String, Uuid> = HashMap::new();
    let tags = sb.table("tags", "name.asc").await?;
    let mut new_tags = 0;
    for row in &tags {
        let (Some(old_id), name) = (row["id"].as_str(), text(row, "name")) else { continue };
        if name.is_empty() || text(row, "type") == "content_rating" {
            continue;
        }
        let slug = Some(text(row, "slug")).filter(|s| !s.is_empty()).unwrap_or_else(|| slugify(&name));
        let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM tags WHERE slug = $1")
            .bind(&slug)
            .fetch_optional(db)
            .await?;
        let id = match existing {
            Some(id) => id,
            None => {
                new_tags += 1;
                let color = Some(text(row, "color")).filter(|c| !c.is_empty()).unwrap_or_else(|| "#a3e635".into());
                let kind = Some(text(row, "type")).filter(|t| !t.is_empty()).unwrap_or_else(|| "genre".into());
                sqlx::query_scalar("INSERT INTO tags (name, slug, color, type) VALUES ($1, $2, $3, $4) RETURNING id")
                    .bind(&name)
                    .bind(&slug)
                    .bind(color)
                    .bind(kind)
                    .fetch_one(db)
                    .await?
            }
        };
        tag_ids.insert(old_id.to_string(), id);
    }
    println!("  tags: {} read, {new_tags} new", tags.len());

    let characters = sb.table("characters", "created_at.asc").await?;
    let mut added = 0;
    for row in &characters {
        let Some(id) = uuid(row, "id") else { continue };
        let name = text(row, "name");
        if name.is_empty() {
            continue;
        }
        let rating = if text(row, "content_rating").eq_ignore_ascii_case("nsfw") { "nsfw" } else { "sfw" };
        added += sqlx::query(
            "INSERT INTO characters (id, name, title, greeting, personality, scenario, example_dialogue,
                                     avatar_url, content_rating, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                     COALESCE($10::timestamptz, now()), COALESCE($11::timestamptz, $10::timestamptz, now()))
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(&name)
        .bind(text(row, "title"))
        .bind(text(row, "greeting"))
        .bind(text(row, "personality"))
        .bind(text(row, "scenario"))
        .bind(text(row, "example_dialogue"))
        .bind(text(row, "avatar_url"))
        .bind(rating)
        .bind(timestamp(row, "created_at"))
        .bind(timestamp(row, "updated_at"))
        .execute(db)
        .await?
        .rows_affected();
    }
    println!("  characters: {} read, {added} new", characters.len());

    let links = sb.table("character_tags", "character_id.asc").await?;
    let mut added = 0;
    for row in &links {
        let (Some(character_id), Some(tag_id)) =
            (uuid(row, "character_id"), row["tag_id"].as_str().and_then(|t| tag_ids.get(t)))
        else {
            continue;
        };
        added += sqlx::query(
            "INSERT INTO character_tags (character_id, tag_id)
             SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM characters WHERE id = $1)
             ON CONFLICT DO NOTHING",
        )
        .bind(character_id)
        .bind(tag_id)
        .execute(db)
        .await?
        .rows_affected();
    }
    println!("  character tags: {} read, {added} new", links.len());

    let personas = sb.table("personas", "created_at.asc").await?;
    let mut added = 0;
    for row in &personas {
        let Some(id) = uuid(row, "id") else { continue };
        let name = text(row, "name");
        if name.is_empty() {
            continue;
        }
        // Only one persona may be the default; keep the first one marked.
        let has_default: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM personas WHERE is_default)")
            .fetch_one(db)
            .await?;
        let is_default = row["is_default"].as_bool().unwrap_or(false) && !has_default;
        added += sqlx::query(
            "INSERT INTO personas (id, name, personality, is_default, created_at)
             VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(&name)
        .bind(text(row, "personality"))
        .bind(is_default)
        .bind(timestamp(row, "created_at"))
        .execute(db)
        .await?
        .rows_affected();
    }
    println!("  personas: {} read, {added} new", personas.len());

    let chats = sb.table("chats", "created_at.asc").await?;
    let mut added = 0;
    for row in &chats {
        let (Some(id), Some(character_id)) = (uuid(row, "id"), uuid(row, "character_id")) else { continue };
        added += sqlx::query(
            "INSERT INTO chats (id, character_id, persona_id, created_at, updated_at)
             SELECT $1, $2, (SELECT id FROM personas WHERE id = $3),
                    COALESCE($4::timestamptz, now()), COALESCE($5::timestamptz, $4::timestamptz, now())
             WHERE EXISTS (SELECT 1 FROM characters WHERE id = $2)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(character_id)
        .bind(uuid(row, "persona_id"))
        .bind(timestamp(row, "created_at"))
        .bind(timestamp(row, "updated_at"))
        .execute(db)
        .await?
        .rows_affected();
    }
    println!("  chats: {} read, {added} new", chats.len());

    let messages = sb.table("messages", "created_at.asc").await?;
    let mut added = 0;
    for row in &messages {
        let (Some(id), Some(chat_id)) = (uuid(row, "id"), uuid(row, "chat_id")) else { continue };
        let role = text(row, "role");
        if role != "user" && role != "assistant" {
            continue;
        }
        let thinking = Some(text(row, "thinking")).filter(|t| !t.is_empty());
        added += sqlx::query(
            "INSERT INTO messages (id, chat_id, role, content, thinking, created_at)
             SELECT $1, $2, $3, $4, $5, COALESCE($6::timestamptz, clock_timestamp())
             WHERE EXISTS (SELECT 1 FROM chats WHERE id = $2)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(chat_id)
        .bind(&role)
        .bind(text(row, "content"))
        .bind(thinking)
        .bind(timestamp(row, "created_at"))
        .execute(db)
        .await?
        .rows_affected();
    }
    println!("  messages: {} read, {added} new", messages.len());

    println!("Done.");
    Ok(())
}
