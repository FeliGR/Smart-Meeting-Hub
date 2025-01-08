import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js";

let textGenerator = null;

self.onmessage = async (e) => {
  switch (e.data.type) {
    case "load":
      await loadModel();
      break;
    case "process":
      await processText(e.data.text);
      break;
  }
};

async function loadModel() {
  try {
    console.log("Loading text generation model...");
    textGenerator = await pipeline(
      "text2text-generation",
      "Xenova/LaMini-Flan-T5-783M"
    );
    self.postMessage({ type: "ready" });
  } catch (error) {
    console.error("Model loading error:", error);
    self.postMessage({ type: "error", message: error.message });
  }
}

async function processText(text) {
  try {
    // 1) Extraer keywords del texto completo
    const keywords = extractKeywords(text);

    // 2) Construir un prompt para TODO el texto (no dividimos en oraciones)
    const ideasPrompt = `
    Based on the following keywords: [${keywords.join(", ")}], one concrete idea related to the discussion context: "${text}". Ensure each idea is distinct and actionable.`;

    // 3) Llamar al modelo con el prompt entero
    const response = await textGenerator(ideasPrompt, {
      max_new_tokens: 150, // Ajusta según necesites la longitud
    });

    // 4) Toma el texto generado y crea UNA sola idea
    const generatedText = response[0].generated_text.trim();

    self.postMessage({
      type: "ideas",
      ideas: [
        {
          id: Date.now(),
          text: generatedText,
          keywords: keywords.slice(0, 3), // Incluye algunas keywords relevantes
        },
      ],
    });
  } catch (error) {
    console.error("Processing error:", error);
    self.postMessage({ type: "error", message: error.message });
  }
}

function extractKeywords(text) {
  console.log("Input text:", text); // Debugging log

  const stopWords = new Set([
    "the", "is", "at", "which", "on", "and",
    "a",   "an", "in", "to",    "for", "of",
    "with","that","this","from","by",
    "hi" // etc.
  ]);
  const words = text.toLowerCase().split(/\W+/);
  console.log("Words after split:", words); // Debugging log

  const frequency = {};
  words.forEach((word) => {
    if (word.length >= 2 && !stopWords.has(word)) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });
  console.log("Frequency:", frequency); // Debugging log

  // Ordenar por frecuencia y tomar los 7 más usados
  const keywords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([word]) => word);

  // Si no hay keywords, meter al menos una por defecto
  return keywords.length > 0 ? keywords : ["default"];
}
