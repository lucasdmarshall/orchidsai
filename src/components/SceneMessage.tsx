"use client";

import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// The AI is asked (backend/src/chat.rs) to answer as tagged lines:
//   Action: <narration>
//   Character: <speaker name>
//   Speech: <what they say>
// parseScene turns that into narration blocks and one bubble per speech.

export type SceneSegment =
  | { kind: "action"; text: string }
  | { kind: "speech"; speaker: string; text: string };

const TAG = /^\s*\**\s*(action|narration|character|speech)\s*\**\s*:\s*\**\s*(.*)$/i;
const TAG_NAMES = ["action", "narration", "character", "speech"];

/**
 * Returns null when the text is not in the tagged format (e.g. greetings or
 * older messages), so the caller can fall back to a single bubble.
 * With `streaming`, an unfinished last line that may still become a tag is
 * held back so it doesn't flash as body text.
 */
export function parseScene(content: string, defaultSpeaker: string, streaming = false): SceneSegment[] | null {
  const lines = content.split("\n");
  if (streaming && lines.length > 0) {
    const last = lines[lines.length - 1].replace(/[\s*]/g, "").toLowerCase();
    if (last && !last.includes(":") && TAG_NAMES.some((t) => t.startsWith(last))) lines.pop();
  }

  const segments: SceneSegment[] = [];
  let speaker: string | null = null;
  let current: SceneSegment | null = null;
  let tagged = false;

  for (const line of lines) {
    const match = line.match(TAG);
    if (match) {
      tagged = true;
      const tag = match[1].toLowerCase();
      const value = match[2].replace(/\**\s*$/, "").trim();
      if (tag === "character") {
        speaker = value;
        current = null;
      } else if (tag === "speech") {
        current = { kind: "speech", speaker: speaker || defaultSpeaker, text: stripQuotes(value) };
        segments.push(current);
      } else {
        current = { kind: "action", text: value };
        segments.push(current);
      }
    } else if (line.trim()) {
      if (current) {
        current.text += (current.text ? "\n" : "") + line.trim();
      } else {
        current = { kind: "action", text: line.trim() };
        segments.push(current);
      }
    }
  }

  if (!tagged) {
    // Only a held-back partial tag so far: nothing to show yet.
    return streaming && !lines.some((l) => l.trim()) && content.trim() ? [] : null;
  }
  return segments.filter((s) => s.text.trim());
}

function stripQuotes(text: string): string {
  return text.replace(/^["“]/, "").replace(/["”]$/, "");
}

/** Stable color per speaker name for avatars of side characters. */
function speakerColor(name: string): string {
  const colors = ["bg-sky-600", "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-emerald-600", "bg-orange-600", "bg-cyan-600"];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function isMainCharacter(speaker: string, characterName: string): boolean {
  const a = speaker.trim().toLowerCase();
  const b = characterName.trim().toLowerCase();
  return a === b || (a.length > 2 && (b.startsWith(a) || a.startsWith(b)));
}

const Cursor = () => <span className="inline-block w-1 h-4 bg-matcha ml-1 align-middle animate-pulse" />;

interface SceneMessageProps {
  segments: SceneSegment[];
  characterName: string;
  avatarUrl: string;
  streaming?: boolean;
  /** Renders inline *action* / "speech" coloring inside a bubble. */
  renderText: (text: string) => ReactNode;
}

export function SceneMessage({ segments, characterName, avatarUrl, streaming, renderText }: SceneMessageProps) {
  return (
    <div className="space-y-3">
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        if (segment.kind === "action") {
          return (
            <div
              key={i}
              className="mx-auto max-w-[90%] px-4 py-2 text-sm leading-relaxed italic text-red-400/90 border-l-2 border-red-500/40 bg-red-500/5 rounded-r-xl whitespace-pre-wrap"
            >
              {segment.text}
              {streaming && isLast && <Cursor />}
            </div>
          );
        }
        const main = isMainCharacter(segment.speaker, characterName);
        return (
          <div key={i} className="flex gap-3 max-w-[85%]">
            <Avatar className="w-8 h-8 flex-shrink-0 border border-white/10">
              {main && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className={main ? "bg-zinc-800" : `${speakerColor(segment.speaker)} text-white`}>
                {segment.speaker.trim()[0]?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1 min-w-0">
              <div className={`text-xs font-semibold ${main ? "text-matcha" : "text-zinc-300"}`}>{segment.speaker}</div>
              <div className="p-4 rounded-[1.5rem] rounded-tl-none text-sm leading-relaxed bg-zinc-900 border border-zinc-800 text-white whitespace-pre-wrap">
                {renderText(segment.text)}
                {streaming && isLast && <Cursor />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
