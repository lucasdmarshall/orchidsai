import { NextRequest } from "next/server";
import { callOpenRouter, parseThinkingContent, ChatMessage } from "@/lib/openrouter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      model = "google/gemini-2.0-flash-exp:free",
      maxTokens = 512,
      systemPrompt,
      characterName,
      characterPersonality,
      userPersona,
      contextSummary
    } = body;

    // Build the system message
    let systemContent = systemPrompt || "You are a helpful AI assistant.";

    if (characterName) {
      systemContent = `You are ${characterName}. ${characterPersonality || ""}`;
    }

    if (userPersona) {
      systemContent += `\n\nThe user you are talking to: ${userPersona}`;
    }

    // Build messages array for OpenRouter
    const apiMessages: ChatMessage[] = [
      { role: "system", content: systemContent }
    ];

    // Add context summary if provided
    if (contextSummary) {
      apiMessages.push({
        role: "system",
        content: `[Previous conversation context]\n${contextSummary}\n[End context]`
      });
    }

    // Add conversation messages
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.image) {
          // Handle image input
          apiMessages.push({
            role: msg.role,
            content: [
              { type: "text", text: msg.content },
              { type: "image_url", image_url: { url: msg.image } }
            ]
          });
        } else {
          apiMessages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }

    console.log("Calling OpenRouter with model:", model);

    const response = await callOpenRouter(apiMessages, model, maxTokens, true);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", errorText);
      return new Response(JSON.stringify({ error: "API request failed" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      return new Response("No response body", { status: 500 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let fullContent = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    fullContent += content;

                    // Parse thinking content and send structured response
                    const { thinking, response: cleanResponse } = parseThinkingContent(fullContent);

                    controller.enqueue(encoder.encode(
                      JSON.stringify({
                        content,
                        thinking,
                        fullContent: cleanResponse
                      }) + "\n"
                    ));
                  }
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
