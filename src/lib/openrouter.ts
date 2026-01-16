// OpenRouter API client with key rotation
// Keys should be stored in environment variables (comma-separated for multiple keys)

export { DEFAULT_MODELS, DEFAULT_SFW_SYSTEM_PROMPT, DEFAULT_NSFW_SYSTEM_PROMPT, type ModelConfig } from "./constants";

function getApiKeys(): string[] {
  const envKeys = process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "";
  if (!envKeys) {
    console.error("No OpenRouter API keys configured. Set OPENROUTER_API_KEYS in environment variables.");
    return [];
  }
  return envKeys.split(",").map(k => k.trim()).filter(Boolean);
}

let lastKeyIndex = -1;

export function getRandomApiKey(): string {
  const API_KEYS = getApiKeys();
  if (API_KEYS.length === 0) {
    throw new Error("No OpenRouter API keys configured");
  }
  let newIndex: number;
  do {
    newIndex = Math.floor(Math.random() * API_KEYS.length);
  } while (newIndex === lastKeyIndex && API_KEYS.length > 1);
  lastKeyIndex = newIndex;
  return API_KEYS[newIndex];
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<
    | { type: "text"; text: string } 
    | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  >;
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
}

export async function callOpenRouter(
  messages: ChatMessage[],
  modelId: string,
  maxTokens: number = 512,
  stream: boolean = true
): Promise<Response> {
  const apiKey = getRandomApiKey();

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://orchids-ai-chat.vercel.app",
      "X-Title": "Orchids AI Chat",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: maxTokens,
      stream,
    }),
  });

  return response;
}

// Parse thinking content from response
export function parseThinkingContent(content: string): { thinking: string | null; response: string } {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const response = content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
    return { thinking, response };
  }
  return { thinking: null, response: content };
}

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
