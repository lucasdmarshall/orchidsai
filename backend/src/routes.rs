use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Postgres, QueryBuilder, Row};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult, OrNotFound},
    models::{Character, Chat, ChatCharacter, ChatSummary, Message, Persona, Settings, Tag},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/tags", get(list_tags))
        .route("/api/characters", get(list_characters).post(create_character))
        .route(
            "/api/characters/{id}",
            get(get_character).patch(update_character).delete(delete_character),
        )
        .route("/api/personas", get(list_personas).post(create_persona))
        .route("/api/personas/{id}", axum::routing::patch(update_persona).delete(delete_persona))
        .route("/api/personas/{id}/default", post(set_default_persona))
        .route("/api/chats", get(list_chats).post(create_chat))
        .route("/api/chats/{id}", axum::routing::delete(delete_chat))
        .route("/api/chats/{id}/messages", get(list_messages).post(create_message))
        .route("/api/settings", get(get_settings).put(save_settings))
}

const CHARACTER_COLUMNS: &str = "id, name, title, greeting, personality, scenario, example_dialogue, \
     avatar_url, content_rating, created_at, updated_at";

fn check_rating(rating: &str) -> AppResult<()> {
    match rating {
        "sfw" | "nsfw" => Ok(()),
        _ => Err(AppError::BadRequest("content_rating must be 'sfw' or 'nsfw'".into())),
    }
}

// ---------- tags ----------

async fn list_tags(State(state): State<AppState>) -> AppResult<Json<Vec<Tag>>> {
    let tags = sqlx::query_as::<_, Tag>("SELECT id, name, slug, color, type FROM tags ORDER BY name")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(tags))
}

/// Fills in `tags` for each character with one query.
async fn attach_tags(db: &sqlx::PgPool, characters: &mut [Character]) -> AppResult<()> {
    if characters.is_empty() {
        return Ok(());
    }
    let ids: Vec<Uuid> = characters.iter().map(|c| c.id).collect();
    let rows = sqlx::query(
        "SELECT ct.character_id, t.id, t.name, t.slug, t.color, t.type
         FROM character_tags ct JOIN tags t ON t.id = ct.tag_id
         WHERE ct.character_id = ANY($1)
         ORDER BY t.name",
    )
    .bind(&ids)
    .fetch_all(db)
    .await?;

    let mut by_character: HashMap<Uuid, Vec<Tag>> = HashMap::new();
    for row in rows {
        by_character.entry(row.get("character_id")).or_default().push(Tag {
            id: row.get("id"),
            name: row.get("name"),
            slug: row.get("slug"),
            color: row.get("color"),
            kind: row.get("type"),
        });
    }
    for character in characters {
        character.tags = by_character.remove(&character.id).unwrap_or_default();
    }
    Ok(())
}

// ---------- characters ----------

#[derive(Deserialize)]
struct CharacterQuery {
    page: Option<i64>,
    limit: Option<i64>,
    /// "sfw" | "nsfw"; anything else means all.
    rating: Option<String>,
    search: Option<String>,
    /// Tag slug.
    tag: Option<String>,
}

fn push_character_filters(qb: &mut QueryBuilder<'_, Postgres>, q: &CharacterQuery) {
    qb.push(" WHERE true");
    if let Some(rating) = q.rating.as_deref().filter(|r| matches!(*r, "sfw" | "nsfw")) {
        qb.push(" AND content_rating = ").push_bind(rating.to_string());
    }
    if let Some(search) = q.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let escaped = search.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        qb.push(" AND (name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR title ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if let Some(tag) = q.tag.as_deref().filter(|t| !t.is_empty()) {
        qb.push(
            " AND EXISTS (SELECT 1 FROM character_tags ct JOIN tags t ON t.id = ct.tag_id \
             WHERE ct.character_id = characters.id AND t.slug = ",
        )
        .push_bind(tag.to_string())
        .push(")");
    }
}

async fn list_characters(
    State(state): State<AppState>,
    Query(q): Query<CharacterQuery>,
) -> AppResult<Json<Value>> {
    let limit = q.limit.unwrap_or(12).clamp(1, 100);
    let offset = q.page.unwrap_or(0).max(0) * limit;

    let mut count_qb = QueryBuilder::new("SELECT count(*) FROM characters");
    push_character_filters(&mut count_qb, &q);
    let total: i64 = count_qb.build_query_scalar().fetch_one(&state.db).await?;

    let mut qb = QueryBuilder::new(format!("SELECT {CHARACTER_COLUMNS} FROM characters"));
    push_character_filters(&mut qb, &q);
    qb.push(" ORDER BY created_at DESC LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(offset);
    let mut items: Vec<Character> = qb.build_query_as().fetch_all(&state.db).await?;
    attach_tags(&state.db, &mut items).await?;

    Ok(Json(json!({ "items": items, "total": total })))
}

async fn get_character(State(state): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Character>> {
    let character = sqlx::query_as::<_, Character>(&format!("SELECT {CHARACTER_COLUMNS} FROM characters WHERE id = $1"))
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .or_not_found()?;
    let mut list = [character];
    attach_tags(&state.db, &mut list).await?;
    let [character] = list;
    Ok(Json(character))
}

#[derive(Deserialize)]
struct NewCharacter {
    name: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    greeting: String,
    #[serde(default)]
    personality: String,
    #[serde(default)]
    scenario: String,
    #[serde(default)]
    example_dialogue: String,
    #[serde(default)]
    avatar_url: String,
    #[serde(default = "default_rating")]
    content_rating: String,
    #[serde(default)]
    tag_ids: Vec<Uuid>,
}

fn default_rating() -> String {
    "sfw".into()
}

async fn create_character(
    State(state): State<AppState>,
    Json(body): Json<NewCharacter>,
) -> AppResult<(StatusCode, Json<Character>)> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    check_rating(&body.content_rating)?;

    let mut tx = state.db.begin().await?;
    let character = sqlx::query_as::<_, Character>(&format!(
        "INSERT INTO characters (name, title, greeting, personality, scenario, example_dialogue, avatar_url, content_rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING {CHARACTER_COLUMNS}"
    ))
    .bind(body.name.trim())
    .bind(&body.title)
    .bind(&body.greeting)
    .bind(&body.personality)
    .bind(&body.scenario)
    .bind(&body.example_dialogue)
    .bind(&body.avatar_url)
    .bind(&body.content_rating)
    .fetch_one(&mut *tx)
    .await?;

    if !body.tag_ids.is_empty() {
        sqlx::query(
            "INSERT INTO character_tags (character_id, tag_id)
             SELECT $1, id FROM tags WHERE id = ANY($2)
             ON CONFLICT DO NOTHING",
        )
        .bind(character.id)
        .bind(&body.tag_ids)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let mut list = [character];
    attach_tags(&state.db, &mut list).await?;
    let [character] = list;
    Ok((StatusCode::CREATED, Json(character)))
}

#[derive(Deserialize)]
struct CharacterPatch {
    name: Option<String>,
    title: Option<String>,
    greeting: Option<String>,
    personality: Option<String>,
    scenario: Option<String>,
    example_dialogue: Option<String>,
    avatar_url: Option<String>,
    content_rating: Option<String>,
    tag_ids: Option<Vec<Uuid>>,
}

async fn update_character(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<CharacterPatch>,
) -> AppResult<Json<Character>> {
    if let Some(rating) = &body.content_rating {
        check_rating(rating)?;
    }
    if body.name.as_deref().is_some_and(|n| n.trim().is_empty()) {
        return Err(AppError::BadRequest("name cannot be empty".into()));
    }

    let mut tx = state.db.begin().await?;
    let character = sqlx::query_as::<_, Character>(&format!(
        "UPDATE characters SET
            name = COALESCE($2, name),
            title = COALESCE($3, title),
            greeting = COALESCE($4, greeting),
            personality = COALESCE($5, personality),
            scenario = COALESCE($6, scenario),
            example_dialogue = COALESCE($7, example_dialogue),
            avatar_url = COALESCE($8, avatar_url),
            content_rating = COALESCE($9, content_rating),
            updated_at = now()
         WHERE id = $1
         RETURNING {CHARACTER_COLUMNS}"
    ))
    .bind(id)
    .bind(body.name.as_deref().map(str::trim))
    .bind(&body.title)
    .bind(&body.greeting)
    .bind(&body.personality)
    .bind(&body.scenario)
    .bind(&body.example_dialogue)
    .bind(&body.avatar_url)
    .bind(&body.content_rating)
    .fetch_optional(&mut *tx)
    .await?
    .or_not_found()?;

    if let Some(tag_ids) = &body.tag_ids {
        sqlx::query("DELETE FROM character_tags WHERE character_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT INTO character_tags (character_id, tag_id)
             SELECT $1, id FROM tags WHERE id = ANY($2)",
        )
        .bind(id)
        .bind(tag_ids)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let mut list = [character];
    attach_tags(&state.db, &mut list).await?;
    let [character] = list;
    Ok(Json(character))
}

/// Also removes the character's chats and messages (ON DELETE CASCADE).
async fn delete_character(State(state): State<AppState>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let result = sqlx::query("DELETE FROM characters WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---------- personas ----------

const PERSONA_COLUMNS: &str = "id, name, personality, is_default, created_at, updated_at";

async fn list_personas(State(state): State<AppState>) -> AppResult<Json<Vec<Persona>>> {
    let personas = sqlx::query_as::<_, Persona>(&format!(
        "SELECT {PERSONA_COLUMNS} FROM personas ORDER BY created_at DESC"
    ))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(personas))
}

#[derive(Deserialize)]
struct NewPersona {
    name: String,
    #[serde(default)]
    personality: String,
}

async fn create_persona(
    State(state): State<AppState>,
    Json(body): Json<NewPersona>,
) -> AppResult<(StatusCode, Json<Persona>)> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    let persona = sqlx::query_as::<_, Persona>(&format!(
        "INSERT INTO personas (name, personality) VALUES ($1, $2) RETURNING {PERSONA_COLUMNS}"
    ))
    .bind(body.name.trim())
    .bind(&body.personality)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(persona)))
}

#[derive(Deserialize)]
struct PersonaPatch {
    name: Option<String>,
    personality: Option<String>,
}

async fn update_persona(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<PersonaPatch>,
) -> AppResult<Json<Persona>> {
    if body.name.as_deref().is_some_and(|n| n.trim().is_empty()) {
        return Err(AppError::BadRequest("name cannot be empty".into()));
    }
    let persona = sqlx::query_as::<_, Persona>(&format!(
        "UPDATE personas SET
            name = COALESCE($2, name),
            personality = COALESCE($3, personality),
            updated_at = now()
         WHERE id = $1
         RETURNING {PERSONA_COLUMNS}"
    ))
    .bind(id)
    .bind(body.name.as_deref().map(str::trim))
    .bind(&body.personality)
    .fetch_optional(&state.db)
    .await?
    .or_not_found()?;
    Ok(Json(persona))
}

async fn delete_persona(State(state): State<AppState>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let result = sqlx::query("DELETE FROM personas WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct DefaultBody {
    #[serde(default = "yes")]
    is_default: bool,
}

fn yes() -> bool {
    true
}

/// Makes this persona the default (clearing any other), or clears it.
async fn set_default_persona(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<DefaultBody>,
) -> AppResult<Json<Persona>> {
    let mut tx = state.db.begin().await?;
    if body.is_default {
        sqlx::query("UPDATE personas SET is_default = false WHERE is_default AND id <> $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    let persona = sqlx::query_as::<_, Persona>(&format!(
        "UPDATE personas SET is_default = $2, updated_at = now() WHERE id = $1 RETURNING {PERSONA_COLUMNS}"
    ))
    .bind(id)
    .bind(body.is_default)
    .fetch_optional(&mut *tx)
    .await?
    .or_not_found()?;
    tx.commit().await?;
    Ok(Json(persona))
}

// ---------- chats ----------

async fn list_chats(State(state): State<AppState>) -> AppResult<Json<Vec<ChatSummary>>> {
    let rows = sqlx::query(
        "SELECT c.id, c.character_id, c.persona_id, c.created_at, c.updated_at,
                ch.name, ch.title, ch.avatar_url,
                last.content AS last_message,
                (SELECT count(*) FROM messages m WHERE m.chat_id = c.id) AS message_count
         FROM chats c
         JOIN characters ch ON ch.id = c.character_id
         LEFT JOIN LATERAL (
             SELECT content FROM messages m WHERE m.chat_id = c.id ORDER BY created_at DESC LIMIT 1
         ) last ON true
         ORDER BY c.updated_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    let chats = rows
        .into_iter()
        .map(|row| ChatSummary {
            chat: Chat {
                id: row.get("id"),
                character_id: row.get("character_id"),
                persona_id: row.get("persona_id"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            },
            character: ChatCharacter {
                id: row.get("character_id"),
                name: row.get("name"),
                title: row.get("title"),
                avatar_url: row.get("avatar_url"),
            },
            last_message: row.get("last_message"),
            message_count: row.get("message_count"),
        })
        .collect();
    Ok(Json(chats))
}

#[derive(Deserialize)]
struct NewChat {
    character_id: Uuid,
    persona_id: Option<Uuid>,
    /// Return the most recent chat for this character + persona instead of
    /// creating a new one, when there is one.
    #[serde(default)]
    reuse_latest: bool,
    /// Saved as the first assistant message when a new chat is created.
    greeting: Option<String>,
}

const CHAT_COLUMNS: &str = "id, character_id, persona_id, created_at, updated_at";

async fn create_chat(State(state): State<AppState>, Json(body): Json<NewChat>) -> AppResult<(StatusCode, Json<Chat>)> {
    let mut tx = state.db.begin().await?;
    if body.reuse_latest {
        // Serialize concurrent opens of the same character so they share one chat.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
            .bind(body.character_id.to_string())
            .execute(&mut *tx)
            .await?;
        let existing = sqlx::query_as::<_, Chat>(&format!(
            "SELECT {CHAT_COLUMNS} FROM chats
             WHERE character_id = $1 AND persona_id IS NOT DISTINCT FROM $2
             ORDER BY updated_at DESC LIMIT 1"
        ))
        .bind(body.character_id)
        .bind(body.persona_id)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(chat) = existing {
            tx.commit().await?;
            return Ok((StatusCode::OK, Json(chat)));
        }
    }

    let chat = sqlx::query_as::<_, Chat>(&format!(
        "INSERT INTO chats (character_id, persona_id) VALUES ($1, $2) RETURNING {CHAT_COLUMNS}"
    ))
    .bind(body.character_id)
    .bind(body.persona_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|err| match &err {
        sqlx::Error::Database(db) if db.is_foreign_key_violation() => {
            AppError::BadRequest("character or persona does not exist".into())
        }
        _ => err.into(),
    })?;

    if let Some(greeting) = body.greeting.as_deref().filter(|g| !g.is_empty()) {
        sqlx::query("INSERT INTO messages (chat_id, role, content) VALUES ($1, 'assistant', $2)")
            .bind(chat.id)
            .bind(greeting)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(chat)))
}

async fn delete_chat(State(state): State<AppState>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let result = sqlx::query("DELETE FROM chats WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

const MESSAGE_COLUMNS: &str = "id, chat_id, role, content, thinking, created_at";

async fn list_messages(State(state): State<AppState>, Path(chat_id): Path<Uuid>) -> AppResult<Json<Vec<Message>>> {
    let messages = sqlx::query_as::<_, Message>(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM messages WHERE chat_id = $1 ORDER BY created_at"
    ))
    .bind(chat_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(messages))
}

#[derive(Deserialize)]
struct NewMessage {
    role: String,
    content: String,
    thinking: Option<String>,
}

async fn create_message(
    State(state): State<AppState>,
    Path(chat_id): Path<Uuid>,
    Json(body): Json<NewMessage>,
) -> AppResult<(StatusCode, Json<Message>)> {
    if !matches!(body.role.as_str(), "user" | "assistant") {
        return Err(AppError::BadRequest("role must be 'user' or 'assistant'".into()));
    }
    let mut tx = state.db.begin().await?;
    let touched = sqlx::query("UPDATE chats SET updated_at = now() WHERE id = $1")
        .bind(chat_id)
        .execute(&mut *tx)
        .await?;
    if touched.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    let message = sqlx::query_as::<_, Message>(&format!(
        "INSERT INTO messages (chat_id, role, content, thinking) VALUES ($1, $2, $3, $4) RETURNING {MESSAGE_COLUMNS}"
    ))
    .bind(chat_id)
    .bind(&body.role)
    .bind(&body.content)
    .bind(body.thinking.as_deref().filter(|t| !t.is_empty()))
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(message)))
}

// ---------- settings ----------

async fn get_settings(State(state): State<AppState>) -> AppResult<Json<Settings>> {
    let row = sqlx::query("SELECT sfw_system_prompt, nsfw_system_prompt, max_tokens, models FROM settings WHERE id = 1")
        .fetch_optional(&state.db)
        .await?;
    let settings = row
        .map(|row| Settings {
            sfw_system_prompt: row.get("sfw_system_prompt"),
            nsfw_system_prompt: row.get("nsfw_system_prompt"),
            max_tokens: row.get("max_tokens"),
            models: row.get("models"),
        })
        .unwrap_or_default();
    Ok(Json(settings))
}

async fn save_settings(State(state): State<AppState>, Json(body): Json<Settings>) -> AppResult<Json<Settings>> {
    if let Some(models) = &body.models {
        if !models.is_array() {
            return Err(AppError::BadRequest("models must be an array".into()));
        }
    }
    sqlx::query(
        "INSERT INTO settings (id, sfw_system_prompt, nsfw_system_prompt, max_tokens, models, updated_at)
         VALUES (1, $1, $2, $3, $4, now())
         ON CONFLICT (id) DO UPDATE SET
            sfw_system_prompt = EXCLUDED.sfw_system_prompt,
            nsfw_system_prompt = EXCLUDED.nsfw_system_prompt,
            max_tokens = EXCLUDED.max_tokens,
            models = EXCLUDED.models,
            updated_at = now()",
    )
    .bind(&body.sfw_system_prompt)
    .bind(&body.nsfw_system_prompt)
    .bind(body.max_tokens)
    .bind(&body.models)
    .execute(&state.db)
    .await?;
    Ok(Json(body))
}
