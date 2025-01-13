// keywordWorker.js
import {
  TextStreamer,
  pipeline,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0";

const TASK_NAME = "text-generation";
const MODEL_NAME = "onnx-community/Qwen2.5-0.5B-Instruct";

let generator = null;

self.onmessage = async (e) => {
  switch (e.data.type) {
    case "load":
      await load();
      break;
    case "generate_keywords":
      const result_keywords = await generate_keywords(e.data.prompt);
      self.postMessage({
        type: "result_keywords",
        result_keywords: result_keywords,
      });
      break;
    case "generate_ideas":
      const result_ideas = await generate_ideas(e.data.prompt);
      self.postMessage({
        type: "result_ideas",
        result_ideas: result_ideas,
      });
      break;
    default:
      console.warn("Unknown message type:", e.data);
  }
};

// Function to load the model
async function load() {
  console.log("QWEN2.5 LOADING...");
  generator = await pipeline(TASK_NAME, MODEL_NAME, {
    dtype: "fp16",
    device: "wasm",
  });

  // WARM-UP: Perform a dummy inference
  await generator("Warm up", {
    max_new_tokens: 1,
  });
  self.postMessage({ type: "ready" });
}

// Helper function that extracts keywords based on a custom separator (pipe |)
function extractKeywordsWithSeparator(text, separator = "|") {
  // Check if text is a string; if not, try to convert or extract a string.
  if (typeof text !== "string") {
    console.warn("Expected a string but received:", text);
    text = JSON.stringify(text);
  }

  // Split on the separator and trim each element
  const keywords = text.split(separator).map((keyword) => keyword.trim());
  return keywords.filter((k) => k.length > 0).slice(0, 3);
}

// Function to generate keywords using the specified prompt
async function generate_keywords(prompt) {
  // Calling the generator with the prompt.
  const output = await generator(prompt, {
    max_new_tokens: 30,
    temperature: 0.5,
    top_p: 0.5,
    do_sample: true,
    early_stopping: true,
  });

  // Debug: log the raw output for inspection.
  console.log("Raw output from generator:", output);

  // Try to extract the generated text.
  // Depending on the version/model, this could be a string or an object.
  let generatedText = "";
  if (typeof output[0].generated_text === "string") {
    generatedText = output[0].generated_text;
  } else {
    // If it's not a string, try to access a nested value.
    // For example, if the structure is something like output[0].generated_text[2]['content']
    try {
      generatedText = output[0].generated_text[2]["content"];
    } catch (err) {
      console.error("Error extracting generated_text from output:", err);
      generatedText = JSON.stringify(output[0].generated_text);
    }
  }

  console.log("Extracted generated text:", generatedText);

  // Extract keywords using the pipe separator.
  const keywords = extractKeywordsWithSeparator(generatedText);
  console.log("Extracted keywords:", keywords);
  return keywords;
}

// Function to generate ideas; left similar to generate_keywords. Adjust extraction if needed.
async function generate_ideas(prompt) {
  const output = await generator(prompt, {
    max_new_tokens: 200,
    temperature: 0.7,
    top_p: 0.8,
    do_sample: true,
    early_stopping: true,
  });

  console.log("Raw ideas output:", output);

  let generatedText = "";
  if (typeof output[0].generated_text === "string") {
    generatedText = output[0].generated_text;
  } else {
    try {
      generatedText = output[0].generated_text[2]["content"];
    } catch (err) {
      console.error("Error extracting generated_text for ideas:", err);
      generatedText = JSON.stringify(output[0].generated_text);
    }
  }

  console.log("Extracted ideas text:", generatedText);

  // Using the same separator extraction
  const ideas = extractKeywordsWithSeparator(generatedText, "|");
  console.log("Extracted ideas:", ideas);
  return ideas;
}
