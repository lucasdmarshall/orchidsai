import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SFW_SYSTEM_PROMPT, DEFAULT_NSFW_SYSTEM_PROMPT, DEFAULT_MODELS } from "@/lib/constants";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DEFAULT_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("id", DEFAULT_SETTINGS_ID)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (!data) {
      return NextResponse.json({
        sfwSystemPrompt: DEFAULT_SFW_SYSTEM_PROMPT,
        nsfwSystemPrompt: DEFAULT_NSFW_SYSTEM_PROMPT,
        maxTokens: 512,
        models: DEFAULT_MODELS,
      });
    }

    return NextResponse.json({
      sfwSystemPrompt: data.sfw_system_prompt || data.system_prompt || DEFAULT_SFW_SYSTEM_PROMPT,
      nsfwSystemPrompt: data.nsfw_system_prompt || DEFAULT_NSFW_SYSTEM_PROMPT,
      maxTokens: data.max_tokens || 512,
      models: data.models || DEFAULT_MODELS,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sfwSystemPrompt, nsfwSystemPrompt, maxTokens, models } = body;

    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("id", DEFAULT_SETTINGS_ID)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("settings")
        .update({
          sfw_system_prompt: sfwSystemPrompt,
          nsfw_system_prompt: nsfwSystemPrompt,
          max_tokens: maxTokens,
          models: models,
          updated_at: new Date().toISOString(),
        })
        .eq("id", DEFAULT_SETTINGS_ID);

      if (error) throw error;
    } else {
      const { error } = await supabase.from("settings").insert({
        id: DEFAULT_SETTINGS_ID,
        sfw_system_prompt: sfwSystemPrompt,
        nsfw_system_prompt: nsfwSystemPrompt,
        max_tokens: maxTokens,
        models: models,
      });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
