import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userInput = encodeURIComponent(body.message || "");

    const response = await fetch(`http://72.62.244.137:8000/rp?user_input=${userInput}`, {
      method: "GET",
    });

    if (!response.ok) {
      return new Response("AI API error", { status: response.status });
    }

    return new Response(response.body, {
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
