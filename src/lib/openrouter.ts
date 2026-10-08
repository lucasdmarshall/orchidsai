// Chat helpers shared by the client. The OpenRouter call itself lives in the
// Rust backend (backend/src/chat.rs).

export { DEFAULT_MODELS, DEFAULT_SFW_SYSTEM_PROMPT, DEFAULT_NSFW_SYSTEM_PROMPT, type ModelConfig } from "./constants";

// Summarize last 4 messages for context continuity
export function summarizeContext(messages: Array<{ role: string; content: string }>): string {
  // Take last 4 messages for summary
  const lastMessages = messages.slice(-4);
  if (lastMessages.length === 0) return "";

  const summary = lastMessages
    .map(m => {
      const speaker = m.role === "user" ? "{{user}}" : "{{char}}";
      // Truncate to 150 chars for better context
      const content = m.content.length > 150 ? m.content.slice(0, 150) + "..." : m.content;
      return `${speaker}: ${content}`;
    })
    .join("\n");

  return summary;
}
