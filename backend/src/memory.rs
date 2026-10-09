//! Chat context and long-term memory.
//!
//! Each request gets the chat's stored summary plus as many recent messages
//! as fit in a token budget. When the chat outgrows the budget, the older
//! messages are folded into the summary in the background (one AI call), so
//! the story is remembered however long the chat gets. The summary keeps a
//! short cast list that the summarizer prunes, so it does not grow forever.

use std::{
    collections::HashSet,
    sync::{LazyLock, Mutex},
};

use chrono::{DateTime, Utc};
use serde_json::json;
use uuid::Uuid;

use crate::{
    error::{AppResult, OrNotFound},
    AppState,
};

/// Rough token count. Latin text is ~4 bytes per token and Burmese ~3 bytes
/// per character, so bytes/3 errs on the safe side for both.
pub fn estimate_tokens(text: &str) -> usize {
    text.len() / 3 + 4
}

/// Token budget for recent messages sent with every request.
pub fn history_budget() -> usize {
    std::env::var("HISTORY_TOKEN_BUDGET").ok().and_then(|v| v.parse().ok()).unwrap_or(12_000)
}

/// After summarizing, keep this share of the budget as verbatim history, so
/// the next summary is only needed after several more turns.
const KEEP_AFTER_FOLD: f32 = 0.6;
/// At most this many recent speakers are listed in the prompt.
const MAX_RECENT_CAST: usize = 12;

#[derive(Clone)]
pub struct StoredMessage {
    pub role: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

pub struct ChatContext {
    pub summary: Option<String>,
    /// Recent messages, oldest first, that fit in the budget.
    pub history: Vec<StoredMessage>,
    /// Speakers seen in the recent messages, most recent first.
    pub recent_cast: Vec<String>,
    /// Older messages that should be folded into the summary now, if any.
    pub to_fold: Vec<StoredMessage>,
    summarized_until: Option<DateTime<Utc>>,
}

pub async fn load(db: &sqlx::PgPool, chat_id: Uuid, budget: usize) -> AppResult<ChatContext> {
    let (summary, summarized_until): (Option<String>, Option<DateTime<Utc>>) =
        sqlx::query_as("SELECT summary, summarized_until FROM chats WHERE id = $1")
            .bind(chat_id)
            .fetch_optional(db)
            .await?
            .or_not_found()?;

    let rows: Vec<(String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT role, content, created_at FROM messages
         WHERE chat_id = $1 AND ($2::timestamptz IS NULL OR created_at > $2)
         ORDER BY created_at",
    )
    .bind(chat_id)
    .bind(summarized_until)
    .fetch_all(db)
    .await?;
    let mut messages: Vec<StoredMessage> =
        rows.into_iter().map(|(role, content, created_at)| StoredMessage { role, content, created_at }).collect();

    // Walk back from the newest message; always keep the last two.
    let keep_from = |limit: usize| {
        let mut used = 0;
        let mut start = messages.len();
        for (i, m) in messages.iter().enumerate().rev() {
            used += estimate_tokens(&m.content);
            if used > limit && messages.len() - i > 2 {
                break;
            }
            start = i;
        }
        start
    };
    let window_start = keep_from(budget);
    let to_fold = if window_start > 0 {
        // Over budget: fold everything older than a smaller window.
        let fold_end = keep_from((budget as f32 * KEEP_AFTER_FOLD) as usize).max(window_start);
        messages[..fold_end].to_vec()
    } else {
        Vec::new()
    };
    let history = messages.split_off(window_start);

    let mut recent_cast: Vec<String> = Vec::new();
    for m in history.iter().rev().filter(|m| m.role == "assistant") {
        for name in speakers(&m.content).into_iter().rev() {
            if recent_cast.len() < MAX_RECENT_CAST && !recent_cast.iter().any(|n| same_name(n, &name)) {
                recent_cast.push(name);
            }
        }
    }

    Ok(ChatContext { summary, history, recent_cast, to_fold, summarized_until })
}

fn same_name(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.trim().to_lowercase().trim_start_matches("the ").to_string();
    norm(a) == norm(b)
}

/// Speaker names in a reply written in the Action/Character/Speech format,
/// including the "Name: text" shorthand. Mirrors src/components/SceneMessage.tsx.
pub fn speakers(content: &str) -> Vec<String> {
    static CHARACTER: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"(?i)^\s*\**\s*character\s*\**\s*:\s*\**\s*([^:(*]+)").unwrap());
    static NAMED: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r#"^\s*\**\s*([^\s:*()"“”][^:*()"“”]{0,40}?)\s*(?:\([^)]*\))?\s*\**\s*:\s*\S"#).unwrap()
    });
    const NOT_SPEAKERS: &[&str] = &[
        "action", "narration", "narrator", "speech", "character", "note", "ooc", "scene", "location", "setting",
        "time", "date", "summary", "thoughts",
    ];

    let mut names = Vec::new();
    for line in content.lines() {
        let name = if let Some(c) = CHARACTER.captures(line) {
            c[1].trim().to_string()
        } else if let Some(c) = NAMED.captures(line) {
            let name = c[1].trim();
            let words = name.split_whitespace().count();
            let first = name.chars().next().unwrap_or('a');
            if words == 0 || words > 4 || NOT_SPEAKERS.contains(&name.to_lowercase().as_str()) || first.is_lowercase() {
                continue;
            }
            name.to_string()
        } else {
            continue;
        };
        if !name.is_empty() && !names.iter().any(|n: &String| same_name(n, &name)) {
            names.push(name);
        }
    }
    names
}

/// Chats whose summary is being rewritten right now.
static FOLDING: LazyLock<Mutex<HashSet<Uuid>>> = LazyLock::new(Default::default);

/// Folds `ctx.to_fold` into the chat's summary in the background.
pub fn spawn_fold(state: AppState, chat_id: Uuid, ctx: &ChatContext, model: String, char_name: String, user_name: String) {
    let Some(last) = ctx.to_fold.last() else { return };
    if !FOLDING.lock().unwrap().insert(chat_id) {
        return;
    }
    let old_summary = ctx.summary.clone();
    let previous_until = ctx.summarized_until;
    let new_until = last.created_at;
    let transcript = ctx
        .to_fold
        .iter()
        .map(|m| {
            let who = if m.role == "user" { user_name.as_str() } else { "Story" };
            format!("[{who}]\n{}", m.content.trim())
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    tokio::spawn(async move {
        let result = fold(&state, chat_id, old_summary, previous_until, new_until, &transcript, &model, &char_name, &user_name).await;
        if let Err(err) = result {
            tracing::warn!(%chat_id, "could not update chat memory: {err:#}");
        }
        FOLDING.lock().unwrap().remove(&chat_id);
    });
}

#[allow(clippy::too_many_arguments)]
async fn fold(
    state: &AppState,
    chat_id: Uuid,
    old_summary: Option<String>,
    previous_until: Option<DateTime<Utc>>,
    new_until: DateTime<Utc>,
    transcript: &str,
    model: &str,
    char_name: &str,
    user_name: &str,
) -> anyhow::Result<()> {
    let instructions = format!(
        "You keep the long-term memory of an ongoing roleplay story between {user_name} (the user) and {char_name}.
Rewrite the memory so it also covers the new messages. Use exactly these sections:
STORY SO FAR: the key events, in order, briefly.
CURRENT SITUATION: where everyone is and what is happening right now.
ABOUT {user_name}: facts {user_name} has revealed about themselves.
RELATIONSHIPS: feelings, promises, debts and secrets between characters.
CAST: one line per named character who still matters, as \"Name - who they are\". Remove minor characters who have left the story and no longer matter.
Keep the whole memory under 350 words, merge and shorten older details as needed, write in the language the story uses, and never invent anything."
    );
    let input = format!(
        "CURRENT MEMORY:\n{}\n\nNEW MESSAGES:\n{transcript}",
        old_summary.as_deref().unwrap_or("(empty - this is the start of the story)")
    );
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": instructions },
            { "role": "user", "content": input },
        ],
        "max_tokens": 900,
        "temperature": 0.3,
        "stream": false,
    });

    let (_lease, response) = state.openrouter.send(&body).await?.map_err(|(status, msg)| anyhow::anyhow!("{status}: {msg}"))?;
    let reply: serde_json::Value = response.json().await?;
    let text = reply["choices"][0]["message"]["content"].as_str().unwrap_or("");
    let (_, summary) = crate::chat::split_thinking(text);
    let summary = summary.trim();
    if summary.len() < 20 {
        anyhow::bail!("summary came back empty");
    }

    // Only save if nobody else moved the memory forward meanwhile.
    let updated = sqlx::query(
        "UPDATE chats SET summary = $2, summarized_until = $3
         WHERE id = $1 AND summarized_until IS NOT DISTINCT FROM $4",
    )
    .bind(chat_id)
    .bind(summary)
    .bind(new_until)
    .bind(previous_until)
    .execute(&state.db)
    .await?;
    tracing::info!(%chat_id, saved = updated.rows_affected() == 1, "chat memory updated");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_speakers_in_all_formats() {
        let reply = "Action: Doors open.\nCharacter: The King\nSpeech: Who?\nGuard (panting): Sire!\n\
                     Note: ooc\nCharacter: King\nSpeech: Again.\nshe said: hi";
        assert_eq!(speakers(reply), vec!["The King", "Guard"]);
    }

    #[test]
    fn token_estimate_counts_burmese_heavier() {
        assert!(estimate_tokens("မင်္ဂလာပါ") > estimate_tokens("hello"));
    }
}
