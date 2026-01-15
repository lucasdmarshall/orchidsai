import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userInput = encodeURIComponent(body.message || "");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    console.log("Fetching from VPS:", userInput.substring(0, 50) + "...");
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const vpsResponse = await fetch(`http://72.62.244.137:8000/rp?user_input=${userInput}`, {
            method: "GET",
            signal: controller.signal,
          });

          if (!vpsResponse.ok) {
            controller.enqueue(new TextEncoder().encode("AI API error"));
            controller.close();
            return;
          }

          const text = await vpsResponse.text();
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(new TextEncoder().encode("Internal Server Error"));
          controller.close();
        }
      }
    });

    clearTimeout(timeoutId);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("API proxy error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
