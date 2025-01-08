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
    const keywords = extractKeywords(text);

    const ideasPrompt = `Instruction: Based on these keywords [${keywords.join(
      ", "
    )}], 
                         generate three innovative ideas related to the context: ${text}`;

    const response = await textGenerator(ideasPrompt, {
      max_new_tokens: 100,
      temperature: 0.8,
    });
    const generatedText = response[0].generated_text;

    self.postMessage({
      type: "ideas",
      ideas: [
        {
          id: Date.now(),
          text: generatedText,
          keywords: keywords.slice(0, 3),
        },
      ],
    });
  } catch (error) {
    console.error("Processing error:", error);
    self.postMessage({ type: "error", message: error.message });
  }
}

function extractKeywords(text) {
  const stopWords = new Set([
    "the",
    "is",
    "at",
    "which",
    "on",
    "and",
    "a",
    "an",
    "in",
    "to",
    "for",
    "of",
  ]);
  const words = text.toLowerCase().split(/\W+/);
  const frequency = {};

  words.forEach((word) => {
    if (word.length > 3 && !stopWords.has(word)) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}
