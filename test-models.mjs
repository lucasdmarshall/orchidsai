
const models = [
  "deepseek/deepseek-r1-0528:free",
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "xiaomi/mimo-v2-flash:free",
  "mistralai/devstral-2512:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3-coder:free",
  "tngtech/deepseek-r1t-chimera:free",
];

const API_KEY = "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";

async function testModel(modelId) {
  console.log(`Testing ${modelId}...`);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 10,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ ${modelId} works!`);
      return true;
    } else {
      const error = await response.text();
      console.log(`❌ ${modelId} failed: ${response.status} ${error}`);
      return false;
    }
  } catch (err) {
    console.log(`❌ ${modelId} error: ${err.message}`);
    return false;
  }
}

async function runTests() {
  for (const model of models) {
    await testModel(model);
  }
}

runTests();
