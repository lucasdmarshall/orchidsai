"use client";

import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// The AI is asked (backend/src/chat.rs) to answer as tagged lines:
//   Action: <narration>
//   Character: <speaker name>
//   Speech: <what they say>
// parseScene turns that into narration blocks and one bubble per speech.
// Any new speaker gets their own bubble automatically, and common slips from
// the format are tolerated:
//   The Guard: Halt!               (name used as the tag)
//   Character: Guard (whispering)  (parenthetical becomes an inline action)
//   Character: Guard               followed by a line without "Speech:"

export type SceneSegment =
  | { kind: "action"; text: string }
  | { kind: "speech"; speaker: string; text: string };

const TAG = /^\s*\**\s*(action|narration|narrator|character|speech)\s*\**\s*:\s*\**\s*(.*)$/i;
const TAG_NAMES = ["action", "narration", "narrator", "character", "speech"];
// "Name: text" or "Name (whispering): text", where Name is a short name.
const NAME_LINE = /^\s*\**\s*([^\s:*()"“”][^:*()"“”]{0,40}?)\s*(?:\(([^)]*)\))?\s*\**\s*:\s*\**\s*(.+)$/;
// Labels that are not people.
const NOT_SPEAKERS = new Set(["note", "ooc", "scene", "location", "setting", "time", "date", "summary", "thoughts"]);

function looksLikeName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length === 0 || words.length > 4 || NOT_SPEAKERS.has(name.trim().toLowerCase())) return false;
  // Latin names start with a capital ("The King", "Captain Rhys"); other scripts (e.g. Burmese) pass.
  const first = words[0][0];
  return first !== first.toLowerCase() || first === first.toUpperCase();
}

/** Splits "Guard (whispering)" into the name and a stage direction. */
function splitSpeaker(raw: string): { name: string; direction: string } {
  const m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m ? { name: m[1].trim(), direction: m[2].trim() } : { name: raw.trim(), direction: "" };
}

/**
 * Returns null when the text is not in the tagged format (e.g. greetings or
 * older messages), so the caller can fall back to a single bubble.
 * With `streaming`, an unfinished last line that may still become a tag or a
 * speaker name is held back so it doesn't flash as narration.
 */
export function parseScene(content: string, defaultSpeaker: string, streaming = false): SceneSegment[] | null {
  const lines = content.split("\n");
  if (streaming && lines.length > 0) {
    const raw = lines[lines.length - 1];
    const compact = raw.replace(/[\s*]/g, "").toLowerCase();
    const maybeTag = compact && TAG_NAMES.some((t) => t.startsWith(compact));
    const maybeName = raw.trim().length < 40 && looksLikeName(raw.replace(/[*(]/g, " ").trim() || "x") && !/^[*"“]/.test(raw.trim());
    if (!raw.includes(":") && raw.trim() && (maybeTag || maybeName)) lines.pop();
  }

  const segments: SceneSegment[] = [];
  let pendingSpeaker = null as { name: string; direction: string } | null;
  let current = null as SceneSegment | null;
  let tagged = false;

  const startSpeech = (speaker: { name: string; direction: string } | null, text: string) => {
    const who = speaker?.name || defaultSpeaker;
    const direction = speaker?.direction ? `*${speaker.direction}* ` : "";
    current = { kind: "speech", speaker: who, text: direction + stripQuotes(text) };
    segments.push(current);
    pendingSpeaker = null;
  };

  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    const tag = line.match(TAG);
    if (tag) {
      tagged = true;
      const kind = tag[1].toLowerCase();
      const value = tag[2].replace(/\**\s*$/, "").trim();
      if (kind === "character") {
        // Tolerate "Character: Name: what they say" on one line.
        const inline = value.match(/^([^:]{1,40}):\s*(.+)$/);
        if (inline) {
          startSpeech(splitSpeaker(inline[1]), inline[2]);
        } else {
          pendingSpeaker = splitSpeaker(value);
          current = null;
        }
      } else if (kind === "speech") {
        startSpeech(pendingSpeaker ?? (current?.kind === "speech" ? { name: current.speaker, direction: "" } : null), value);
      } else {
        current = { kind: "action", text: value };
        segments.push(current);
        pendingSpeaker = null;
      }
      continue;
    }

    const named = line.match(NAME_LINE);
    if (named && looksLikeName(named[1])) {
      tagged = true;
      startSpeech({ name: named[1].trim(), direction: (named[2] || "").trim() }, named[3].replace(/\**\s*$/, ""));
      continue;
    }

    if (pendingSpeaker) {
      // "Character: X" followed by speech without the "Speech:" tag.
      startSpeech(pendingSpeaker, text);
    } else if (current) {
      current.text += (current.text ? "\n" : "") + text;
    } else {
      current = { kind: "action", text };
      segments.push(current);
    }
  }

  if (!tagged) {
    // Only a held-back partial tag so far: nothing to show yet.
    return streaming && !lines.some((l) => l.trim()) && content.trim() ? [] : null;
  }
  return segments.filter((s) => s.text.trim());
}

function stripQuotes(text: string): string {
  return text.trim().replace(/^["\u201c]/, "").replace(/["\u201d]$/, "");
}

/** Stable color per speaker name for avatars of side characters. */
function speakerColor(name: string): string {
  const colors = ["bg-sky-600", "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-emerald-600", "bg-orange-600", "bg-cyan-600"];
  let hash = 0;
  for (const ch of normalizeName(name)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

/** "The King" and "king" are the same speaker. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/^the\s+/, "");
}

function isMainCharacter(speaker: string, characterName: string): boolean {
  const a = normalizeName(speaker);
  const b = normalizeName(characterName);
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
