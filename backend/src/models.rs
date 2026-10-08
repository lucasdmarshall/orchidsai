use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Tag {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub color: String,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Character {
    pub id: Uuid,
    pub name: String,
    pub title: String,
    pub greeting: String,
    pub personality: String,
    pub scenario: String,
    pub example_dialogue: String,
    pub avatar_url: String,
    pub content_rating: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[sqlx(skip)]
    pub tags: Vec<Tag>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Persona {
    pub id: Uuid,
    pub name: String,
    pub personality: String,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Chat {
    pub id: Uuid,
    pub character_id: Uuid,
    pub persona_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ChatCharacter {
    pub id: Uuid,
    pub name: String,
    pub title: String,
    pub avatar_url: String,
}

#[derive(Debug, Serialize)]
pub struct ChatSummary {
    #[serde(flatten)]
    pub chat: Chat,
    pub character: ChatCharacter,
    pub last_message: Option<String>,
    pub message_count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Message {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub sfw_system_prompt: Option<String>,
    pub nsfw_system_prompt: Option<String>,
    pub max_tokens: Option<i32>,
    pub models: Option<serde_json::Value>,
}
