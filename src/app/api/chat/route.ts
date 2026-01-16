import { NextRequest } from "next/server";
import { callOpenRouter, parseThinkingContent, ChatMessage, DEFAULT_NSFW_SYSTEM_PROMPT } from "@/lib/openrouter";

function replacePlaceholders(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
      const {
        messages,
        model = "deepseek/deepseek-r1-0528:free",
        maxTokens = 1024,
      systemPrompt,
      characterName,
      characterPersonality,
      characterScenario,
      characterExampleDialogue,
      userPersona,
      contextSummary
    } = body;

    const basePrompt = systemPrompt || DEFAULT_NSFW_SYSTEM_PROMPT;
    
    const userName = userPersona?.split(":")[0]?.trim() || "User";
    const charName = characterName || "Character";
    
    const processedPersonality = replacePlaceholders(characterPersonality || "", charName, userName);
    const processedScenario = replacePlaceholders(characterScenario || "", charName, userName);
    const processedExampleDialogue = replacePlaceholders(characterExampleDialogue || "", charName, userName);
    
    let systemContent = replacePlaceholders(basePrompt, charName, userName);

    if (characterName) {
      systemContent += `\n\n### CHARACTER DEFINITION:
**Name:** ${charName}
**Personality:** ${processedPersonality || "Not specified"}`;
      
      if (processedScenario) {
        systemContent += `\n**Scenario:** ${processedScenario}`;
      }
      
      if (processedExampleDialogue) {
        systemContent += `\n**Example Dialogue Style:**\n${processedExampleDialogue}`;
      }
    }

    if (userPersona) {
      systemContent += `\n\n### USER PERSONA:
${userPersona}
(Acknowledge and respond to the user according to their persona.)`;
    }

    if (contextSummary) {
      const formattedContext = replacePlaceholders(contextSummary, charName, userName);
      
      systemContent += `\n\n### RECENT CONTEXT (last 4 exchanges):
${formattedContext}
(Continue from this context naturally. Don't repeat what was said.)`;
    }

    const apiMessages: ChatMessage[] = [
      { role: "system", content: systemContent }
    ];

      const isVisionModel = model.includes("vision") || 
                            model.includes("-vl") || 
                            model.includes("gemini") ||
                            model.includes("gpt-4o") ||
                            model.includes("claude-3") ||
                            model.includes("llama-4");

    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.image && isVisionModel) {
          apiMessages.push({
            role: msg.role,
            content: [
              { type: "text", text: msg.content || "What do you see in this image?" },
              { 
                type: "image_url", 
                image_url: { 
                  url: msg.image,
                  detail: "auto"
                } 
              }
            ]
          });
        } else if (msg.image && !isVisionModel) {
          apiMessages.push({
            role: msg.role,
            content: `${msg.content || ""}\n[User shared an image, but this model cannot process images]`
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
