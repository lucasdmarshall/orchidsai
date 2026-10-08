//! POST /api/chat: builds the roleplay prompt, calls OpenRouter with streaming,
//! and re-emits the reply as newline-delimited JSON:
//! `{"content": "<delta>", "thinking": "<text>|null", "fullContent": "<reply so far, without <think>>"}`
//! Each request uses a random key from the key pool (see keys.rs).

use std::sync::{Arc, LazyLock};

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

use crate::{error::AppError, keys::KeyPool, AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/api/chat", post(chat))
}

pub struct OpenRouter {
    url: String,
    pub keys: Arc<KeyPool>,
    http: reqwest::Client,
}

impl OpenRouter {
    pub fn new(keys: Arc<KeyPool>) -> Self {
        Self {
            url: std::env::var("OPENROUTER_URL")
                .unwrap_or_else(|_| "https://openrouter.ai/api/v1/chat/completions".into()),
            keys,
            http: reqwest::Client::new(),
        }
    }
}

/// How many different keys to try before giving up on a request.
const MAX_KEY_ATTEMPTS: usize = 3;

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
    "openrouter/free".into()
}

fn default_max_tokens() -> u32 {
    1024
}

/// Appended to every system prompt. The site splits replies in this format
/// into one bubble per speaker (src/components/SceneMessage.tsx).
const OUTPUT_FORMAT: &str = "### OUTPUT FORMAT (STRICT - overrides any formatting rules above)
Write your whole reply as blocks, each starting on its own line:
Action: <narration - what happens, actions, body language, surroundings>
Character: <name of who speaks>
Speech: <exactly what they say>

Rules:
- All spoken dialogue goes in a Character: line followed by a Speech: line.
- Anyone present in the scene may speak ({{char}}, a guard, a shopkeeper, The King...), but NEVER {{user}}.
- New characters can enter at any time: describe them arriving in an Action: block, then give them their own Character: + Speech: blocks.
- Always use the same name for the same person (don't switch between \"the guard\" and \"Rhys\").
- Put all narration in Action: blocks. Use as many Action, Character and Speech blocks as the scene needs.
- Do not use JSON, markdown, asterisks, or quotation marks around speech.

Example:
Action: The great doors swing open and the hall falls silent.
Character: The King
Speech: Who dares interrupt my court?
Action: {{char}} steps forward and bows low.
Character: {{char}}
Speech: Forgive me, Your Majesty. I bring urgent news.";

const FALLBACK_SYSTEM_PROMPT: &str = "You are {{char}}, roleplaying with {{user}}. Stay in character, \
write vivid replies, and never speak or act for {{user}}.";

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
    prompt.push_str("\n\n");
    prompt.push_str(&replace_placeholders(OUTPUT_FORMAT, char_name, user_name));
    prompt
}

fn is_vision_model(model: &str) -> bool {
    // openrouter/* routers pick a model that supports the request's inputs.
    model.starts_with("openrouter/")
        || ["vision", "-vl", "gemini", "gemma", "gpt-4o", "claude", "llama-4"]
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
    let body = json!({
        "model": req.model,
        "messages": build_messages(&req),
        "max_tokens": req.max_tokens,
        "stream": true,
    });

    // Try a few different keys when one is rate-limited, out of credit or invalid.
    let mut tried = Vec::new();
    let (lease, upstream) = loop {
        let Some(lease) = state.openrouter.keys.acquire(&tried).await? else {
            let error = if tried.is_empty() {
                "No OpenRouter API keys are available on the server"
            } else {
                "All OpenRouter keys are busy or rate-limited, please try again shortly"
            };
            return Ok((StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "error": error }))).into_response());
        };
        let upstream = state
            .openrouter
            .http
            .post(&state.openrouter.url)
            .bearer_auth(&lease.key)
            .header("HTTP-Referer", "https://orchidchat.magickamimosa.com")
            .header("X-Title", "Orchids AI Chat")
            .json(&body)
            .send()
            .await?;

        let status = upstream.status().as_u16();
        if upstream.status().is_success() {
            break (lease, upstream);
        }
        let text = upstream.text().await.unwrap_or_default();
        tracing::warn!(model = %req.model, status, key = %lease.id, "OpenRouter error: {text}");
        let key_problem = matches!(status, 401 | 402 | 403 | 429);
        if key_problem {
            let detail: String = text.chars().take(300).collect();
            state.openrouter.keys.report_failure(lease.id, status, &detail).await?;
        }
        tried.push(lease.id);
        if !key_problem || tried.len() >= MAX_KEY_ATTEMPTS {
            let status = StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY);
            return Ok((status, Json(json!({ "error": "AI request failed" }))).into_response());
        }
    };

    // SSE lines can be split across network chunks, so keep the unfinished tail.
    // The lease lives in the stream so the key counts as busy until the reply ends.
    let mut buffer = String::new();
    let mut full = String::new();
    let mut reasoning = String::new();
    let stream = upstream.bytes_stream().map(move |chunk| {
        let _lease = &lease;
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
            let delta_json = &parsed["choices"][0]["delta"];
            let delta = delta_json["content"].as_str().unwrap_or("");
            // Reasoning models send their thoughts separately from the reply.
            let delta_reasoning = delta_json["reasoning"].as_str().unwrap_or("");
            if delta.is_empty() && delta_reasoning.is_empty() {
                continue;
            }
            full.push_str(delta);
            reasoning.push_str(delta_reasoning);
            let (think_tags, reply) = split_thinking(&full);
            let thinking = if reasoning.trim().is_empty() { think_tags } else { Some(reasoning.trim().to_string()) };
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
