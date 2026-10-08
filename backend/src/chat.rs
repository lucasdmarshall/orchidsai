//! POST /api/chat: builds the roleplay prompt, calls OpenRouter with streaming,
//! and re-emits the reply as newline-delimited JSON:
//! `{"content": "<delta>", "thinking": "<text>|null", "fullContent": "<reply so far, without <think>>"}`

use std::sync::{
    atomic::{AtomicUsize, Ordering},
    LazyLock,
};

use axum::{
    body::{Body, Bytes},
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use futures_util::StreamExt;
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::AppError, AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/api/chat", post(chat))
}

pub struct OpenRouter {
    url: String,
    keys: Vec<String>,
    next_key: AtomicUsize,
    http: reqwest::Client,
}

impl OpenRouter {
    pub fn new(keys: &str) -> Self {
        Self {
            url: std::env::var("OPENROUTER_URL")
                .unwrap_or_else(|_| "https://openrouter.ai/api/v1/chat/completions".into()),
            keys: keys.split(',').map(str::trim).filter(|k| !k.is_empty()).map(String::from).collect(),
            next_key: AtomicUsize::new(0),
            http: reqwest::Client::new(),
        }
    }

    pub fn key_count(&self) -> usize {
        self.keys.len()
    }

    /// Round-robins over the configured keys to spread rate limits.
    fn key(&self) -> Option<&str> {
        if self.keys.is_empty() {
            return None;
        }
        let i = self.next_key.fetch_add(1, Ordering::Relaxed) % self.keys.len();
        Some(&self.keys[i])
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    #[serde(default)]
    messages: Vec<InMessage>,
    #[serde(default = "default_model")]
    model: String,
    #[serde(default = "default_max_tokens")]
    max_tokens: u32,
    system_prompt: Option<String>,
    character_name: Option<String>,
    character_personality: Option<String>,
    character_scenario: Option<String>,
    character_example_dialogue: Option<String>,
    user_persona: Option<String>,
    context_summary: Option<String>,
}

#[derive(Deserialize)]
struct InMessage {
    role: String,
    #[serde(default)]
    content: String,
    image: Option<String>,
}

fn default_model() -> String {
    "deepseek/deepseek-r1-0528:free".into()
}

fn default_max_tokens() -> u32 {
    1024
}

const FALLBACK_SYSTEM_PROMPT: &str = "You are {{char}}, roleplaying with {{user}}. Stay in character, \
write vivid replies with actions in *asterisks* and speech in \"quotes\", and never speak for {{user}}.";

fn replace_placeholders(text: &str, char_name: &str, user_name: &str) -> String {
    static CHAR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\{\{char\}\}").unwrap());
    static USER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\{\{user\}\}").unwrap());
    let text = CHAR.replace_all(text, regex::NoExpand(char_name));
    USER.replace_all(&text, regex::NoExpand(user_name)).into_owned()
}

fn build_system_prompt(req: &ChatRequest) -> String {
    let user_name = req
        .user_persona
        .as_deref()
        .and_then(|p| p.split(':').next())
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .unwrap_or("User");
    let char_name = req.character_name.as_deref().filter(|n| !n.is_empty()).unwrap_or("Character");
    let fill = |text: &Option<String>| replace_placeholders(text.as_deref().unwrap_or(""), char_name, user_name);

    let base = req.system_prompt.as_deref().filter(|p| !p.is_empty()).unwrap_or(FALLBACK_SYSTEM_PROMPT);
    let mut prompt = replace_placeholders(base, char_name, user_name);

    if req.character_name.is_some() {
        let personality = fill(&req.character_personality);
        let personality = if personality.is_empty() { "Not specified".to_string() } else { personality };
        prompt.push_str(&format!(
            "\n\n### CHARACTER DEFINITION:\n**Name:** {char_name}\n**Personality:** {personality}"
        ));
        let scenario = fill(&req.character_scenario);
        if !scenario.is_empty() {
            prompt.push_str(&format!("\n**Scenario:** {scenario}"));
        }
        let dialogue = fill(&req.character_example_dialogue);
        if !dialogue.is_empty() {
            prompt.push_str(&format!("\n**Example Dialogue Style:**\n{dialogue}"));
        }
    }

    if let Some(persona) = req.user_persona.as_deref().filter(|p| !p.is_empty()) {
        prompt.push_str(&format!(
            "\n\n### USER PERSONA:\n{persona}\n(Acknowledge and respond to the user according to their persona.)"
        ));
    }

    let context = fill(&req.context_summary);
    if !context.is_empty() {
        prompt.push_str(&format!(
            "\n\n### RECENT CONTEXT (last 4 exchanges):\n{context}\n(Continue from this context naturally. Don't repeat what was said.)"
        ));
    }
    prompt
}

fn is_vision_model(model: &str) -> bool {
    ["vision", "-vl", "gemini", "gpt-4o", "claude-3", "llama-4"]
        .iter()
        .any(|m| model.contains(m))
}

fn build_messages(req: &ChatRequest) -> Vec<Value> {
    let vision = is_vision_model(&req.model);
    let mut out = vec![json!({ "role": "system", "content": build_system_prompt(req) })];
    for msg in &req.messages {
        let role = if msg.role == "assistant" { "assistant" } else { "user" };
        let content = match msg.image.as_deref().filter(|i| !i.is_empty()) {
            Some(image) if vision => {
                let text = if msg.content.is_empty() { "What do you see in this image?" } else { &msg.content };
                json!([
                    { "type": "text", "text": text },
                    { "type": "image_url", "image_url": { "url": image, "detail": "auto" } }
                ])
            }
            Some(_) => json!(format!("{}\n[User shared an image, but this model cannot process images]", msg.content)),
            None => json!(msg.content),
        };
        out.push(json!({ "role": role, "content": content }));
    }
    out
}

/// Splits `<think>…</think>` reasoning out of the reply, including a think
/// block that is still open while streaming.
fn split_thinking(content: &str) -> (Option<String>, String) {
    static THINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?s)<think>(.*?)</think>").unwrap());
    if let Some(caps) = THINK.captures(content) {
        let thinking = caps[1].trim().to_string();
        let reply = THINK.replace(content, "").trim().to_string();
        return (Some(thinking), reply);
    }
    if let Some((before, after)) = content.split_once("<think>") {
        let thinking = after.trim();
        return ((!thinking.is_empty()).then(|| thinking.to_string()), before.trim().to_string());
    }
    (None, content.to_string())
}

async fn chat(State(state): State<AppState>, Json(req): Json<ChatRequest>) -> Result<Response, AppError> {
    let Some(key) = state.openrouter.key() else {
        let error = json!({ "error": "OpenRouter API key is not configured on the server" });
        return Ok((StatusCode::SERVICE_UNAVAILABLE, Json(error)).into_response());
    };

    let body = json!({
        "model": req.model,
        "messages": build_messages(&req),
        "max_tokens": req.max_tokens,
        "stream": true,
    });
    let upstream = state
        .openrouter
        .http
        .post(&state.openrouter.url)
        .bearer_auth(key)
        .header("HTTP-Referer", "https://orchidchat.magickamimosa.com")
        .header("X-Title", "Orchids AI Chat")
        .json(&body)
        .send()
        .await?;

    if !upstream.status().is_success() {
        let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        let text = upstream.text().await.unwrap_or_default();
        tracing::warn!(model = %req.model, %status, "OpenRouter error: {text}");
        return Ok((status, Json(json!({ "error": "API request failed" }))).into_response());
    }

    // SSE lines can be split across network chunks, so keep the unfinished tail.
    let mut buffer = String::new();
    let mut full = String::new();
    let stream = upstream.bytes_stream().map(move |chunk| {
        let chunk = chunk?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        let mut out = String::new();
        while let Some(newline) = buffer.find('\n') {
            let line: String = buffer.drain(..=newline).collect();
            let Some(data) = line.trim_end().strip_prefix("data: ") else { continue };
            if data == "[DONE]" {
                continue;
            }
            let Ok(parsed) = serde_json::from_str::<Value>(data) else { continue };
            let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str().filter(|d| !d.is_empty()) else {
                continue;
            };
            full.push_str(delta);
            let (thinking, reply) = split_thinking(&full);
            out.push_str(&json!({ "content": delta, "thinking": thinking, "fullContent": reply }).to_string());
            out.push('\n');
        }
        Ok::<_, reqwest::Error>(Bytes::from(out))
    });

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(stream))
        .expect("valid response"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_closed_and_open_think_blocks() {
        assert_eq!(
            split_thinking("<think> hmm </think> Hello"),
            (Some("hmm".into()), "Hello".into())
        );
        assert_eq!(split_thinking("<think>still going"), (Some("still going".into()), "".into()));
        assert_eq!(split_thinking("plain"), (None, "plain".into()));
    }

    #[test]
    fn replaces_placeholders_case_insensitively() {
        assert_eq!(replace_placeholders("{{Char}} meets {{USER}} $1", "Ann", "Bo"), "Ann meets Bo $1");
    }
}
