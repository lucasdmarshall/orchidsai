// Client for the Rust backend (backend/). Set NEXT_PUBLIC_API_URL to its
// origin, e.g. https://orchidapi.magickamimosa.com
import type { ModelConfig } from "./constants";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string;
  type: string;
}

export interface Character {
  id: string;
  name: string;
  title: string;
  greeting: string;
  personality: string;
  scenario: string;
  example_dialogue: string;
  avatar_url: string;
  content_rating: "sfw" | "nsfw";
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface Persona {
  id: string;
  name: string;
  personality: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  character_id: string;
  persona_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSummary extends Chat {
  character: Pick<Character, "id" | "name" | "title" | "avatar_url">;
  last_message: string | null;
  message_count: number;
}

export interface StoredMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  thinking: string | null;
  created_at: string;
}

export interface Settings {
  sfwSystemPrompt: string | null;
  nsfwSystemPrompt: string | null;
  maxTokens: number | null;
  models: ModelConfig[] | null;
}

export type CharacterInput = Partial<
  Pick<Character, "name" | "title" | "greeting" | "personality" | "scenario" | "example_dialogue" | "avatar_url" | "content_rating">
> & { tag_ids?: string[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  tags: () => request<Tag[]>("/api/tags"),

  characters: {
    list: (params: { page?: number; limit?: number; rating?: string; search?: string; tag?: string | null } = {}) => {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
      }
      return request<{ items: Character[]; total: number }>(`/api/characters?${qs}`);
    },
    get: (id: string) => request<Character>(`/api/characters/${id}`),
    create: (input: CharacterInput & { name: string }) => request<Character>("/api/characters", send("POST", input)),
    update: (id: string, input: CharacterInput) => request<Character>(`/api/characters/${id}`, send("PATCH", input)),
    remove: (id: string) => request<void>(`/api/characters/${id}`, send("DELETE")),
  },

  personas: {
    list: () => request<Persona[]>("/api/personas"),
    create: (input: { name: string; personality?: string }) => request<Persona>("/api/personas", send("POST", input)),
    update: (id: string, input: { name?: string; personality?: string }) =>
      request<Persona>(`/api/personas/${id}`, send("PATCH", input)),
    remove: (id: string) => request<void>(`/api/personas/${id}`, send("DELETE")),
    setDefault: (id: string, isDefault: boolean) =>
      request<Persona>(`/api/personas/${id}/default`, send("POST", { is_default: isDefault })),
  },

  chats: {
    list: () => request<ChatSummary[]>("/api/chats"),
    create: (input: { character_id: string; persona_id: string | null; reuse_latest?: boolean; greeting?: string }) =>
      request<Chat>("/api/chats", send("POST", input)),
    remove: (id: string) => request<void>(`/api/chats/${id}`, send("DELETE")),
    messages: (id: string) => request<StoredMessage[]>(`/api/chats/${id}/messages`),
    addMessage: (id: string, input: { role: "user" | "assistant"; content: string; thinking?: string | null }) =>
      request<StoredMessage>(`/api/chats/${id}/messages`, send("POST", input)),
  },

  settings: {
    get: () => request<Settings>("/api/settings"),
    save: (settings: Settings) => request<Settings>("/api/settings", send("PUT", settings)),
  },

  /** Streams newline-delimited JSON chunks; see backend/src/chat.rs. */
  chat: (body: unknown) =>
    fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
