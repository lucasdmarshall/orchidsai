import { NextRequest } from "next/server";
import { callOpenRouter, parseThinkingContent, ChatMessage, DEFAULT_SYSTEM_PROMPT, replacePlaceholders } from "@/lib/openrouter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      model = "google/gemini-2.0-flash-exp:free",
      maxTokens = 1024,
      systemPrompt,
      characterName,
      characterPersonality,
      characterScenario,
      characterExampleDialogue,
      userPersona,
      contextSummary
    } = body;

    // Build the comprehensive roleplay system prompt
    const basePrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    
    // Extract user name from persona
    const userName = userPersona?.split(":")[0]?.trim() || "User";
    const charName = characterName || "Character";
    
    // Replace placeholders in all character fields
    const processedPersonality = replacePlaceholders(characterPersonality || "", charName, userName);
    const processedScenario = replacePlaceholders(characterScenario || "", charName, userName);
    const processedExampleDialogue = replacePlaceholders(characterExampleDialogue || "", charName, userName);
    
    // Replace placeholders and build character context
    let systemContent = replacePlaceholders(basePrompt, charName, userName);

    // Add character definition block
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

    // Add user persona context
    if (userPersona) {
      systemContent += `\n\n### USER PERSONA:
${userPersona}
(Acknowledge and respond to the user according to their persona.)`;
    }

    // Add conversation context summary for continuity (last 2 messages)
    if (contextSummary) {
      const formattedContext = replacePlaceholders(contextSummary, charName, userName);
      
      systemContent += `\n\n### RECENT CONTEXT (last 4 exchanges):
${formattedContext}
(Continue from this context naturally. Don't repeat what was said.)`;
    }

    // Build messages array for OpenRouter
    const apiMessages: ChatMessage[] = [
      { role: "system", content: systemContent }
    ];

    // Check if model supports images (based on common vision model patterns)
    const isVisionModel = model.includes("vision") || 
                          model.includes("-vl") || 
                          model.includes("gemini") ||
                          model.includes("gpt-4o") ||
                          model.includes("claude-3");

    // Add conversation messages
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.image && isVisionModel) {
          // Handle image input for vision-capable models
          // OpenRouter expects this format for multimodal
          apiMessages.push({
            role: msg.role,
            content: [
              { type: "text", text: msg.content || "What do you see in this image?" },
              { 
                type: "image_url", 
                image_url: { 
                  url: msg.image,
                  detail: "auto"  // Let the model decide detail level
                } 
              }
            ]
          });
        } else if (msg.image && !isVisionModel) {
          // For non-vision models, just send text with a note about the image
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
