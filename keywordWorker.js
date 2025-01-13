// ========== Imports ==========
import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js";

// ========== Constants ==========
const PIPELINE_TASK = "text2text-generation";
const MODEL_NAME = "Xenova/LaMini-Flan-T5-783M";
const MAX_NEW_TOKENS = 150;
const STOP_WORDS = new Set([
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
  "with",
  "that",
  "this",
  "from",
  "by",
  "hi",
]);

// ========== Model State ==========
let textGenerator = null;

// ========== Worker Event Listener ==========
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

// ========== Main Functions ==========
 
/**
 * Loads the text generation model using Xenova's Transformers pipeline.
 */
async function loadModel() {
  try {
    console.log("Loading text generation model...");
    textGenerator = await pipeline(PIPELINE_TASK, MODEL_NAME);
    postReady();
  } catch (error) {
    console.error("Model loading error:", error);
    postError(error.message);
  }
}

/**
 * Processes the given text by extracting keywords,
 * building a prompt, and generating a response from the model.
 * @param {string} text - The input text to process
 */
async function processText(text) {
  try {
    // 1) Extract keywords from the entire text
    const keywords = extractKeywords(text);

    // 2) Build a single prompt for the entire text
    const ideasPrompt = buildIdeasPrompt(keywords, text);

    // 3) Generate text from the model using the built prompt
    const response = await textGenerator(ideasPrompt, {
      max_new_tokens: MAX_NEW_TOKENS,
    });

    // 4) Take the generated text and create exactly one idea
    const generatedText = response[0].generated_text.trim();
    postIdeas(generatedText, keywords);
  } catch (error) {
    console.error("Processing error:", error);
    postError(error.message);
  }
}

// ========== Helper Functions ==========

/**
 * Extracts the top 7 keywords from the text, ignoring common stop words.
 * @param {string} text
 * @returns {string[]} - An array of keywords
 */
function extractKeywords(text) {
  console.log("Input text:", text);

  // Split text into words (lowercase + non-word delimiter)
  const words = text.toLowerCase().split(/\W+/);
  console.log("Words after split:", words);

  // Count frequency of each word (excluding short words & stop words)
  const frequency = {};
  words.forEach((word) => {
    if (word.length >= 2 && !STOP_WORDS.has(word)) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });
  console.log("Frequency:", frequency);

  // Sort by frequency and take the top 7
  const keywords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([word]) => word);

  // Return "default" if there are no valid keywords
  return keywords.length > 0 ? keywords : ["default"];
}

/**
 * Builds a prompt for generating ideas based on the extracted keywords and text.
 * @param {string[]} keywords
 * @param {string} text
 * @returns {string} - The prompt to be used by the text generator
 */
function buildIdeasPrompt(keywords, text) {
  // You can adjust formatting/voice here, as needed
  return `
    Based on the following keywords: [${keywords.join(", ")}], 
    one concrete idea related to the discussion context: "${text}". 
    Ensure each idea is distinct and actionable.
  `;
}

// ========== Messaging to Main Thread ==========

/**
 * Informs the main thread that the model is ready.
 */
function postReady() {
  self.postMessage({ type: "ready" });
}

/**
 * Posts an error message to the main thread.
 * @param {string} message
 */
function postError(message) {
  self.postMessage({ type: "error", message });
}

/**
 * Sends the generated idea to the main thread.
 * @param {string} generatedText - The raw generated text from the model
 * @param {string[]} keywords - An array of keywords used in the prompt
 */
function postIdeas(generatedText, keywords) {
  self.postMessage({
    type: "ideas",
    ideas: [
      {
        id: Date.now(),
        text: generatedText,
        keywords: keywords.slice(0, 3), // Include some relevant keywords
      },
    ],
  });
}
