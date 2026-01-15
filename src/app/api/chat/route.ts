import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userInput = encodeURIComponent(body.message || "");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(`http://72.62.244.137:8000/rp?user_input=${userInput}`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return new Response("AI API error", { status: response.status });
    }

    const text = await response.text();
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("API proxy error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
