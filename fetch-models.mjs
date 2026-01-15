
async function fetchModels() {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (response.ok) {
    const data = await response.json();
    const freeModels = data.data.filter(m => m.id.endsWith(":free") || (m.pricing && m.pricing.prompt === "0"));
    console.log("Free Models found:");
    freeModels.forEach(m => console.log(`- ${m.id} (${m.name})`));
  } else {
    console.log("Failed to fetch models");
  }
}

fetchModels();
