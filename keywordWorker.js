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
    case "keywords":
      const keywords = await generate_keywords(e.data.prompt);
      self.postMessage({
        type: "keywords",
        keywords: keywords,
      });
      break;
    case "ideas":
      const ideas = await generate_ideas(e.data.prompt);
      self.postMessage({
        type: "ideas",
        ideas: ideas,
      });
      break;
    default:
      console.warn("Unknown message type:", e.data);
  }
};

async function load() {
  generator = await pipeline(TASK_NAME, MODEL_NAME, {
    dtype: "fp16",
    device: "wasm",
  });

  await generator("Warm up", {
    max_new_tokens: 1,
  });
  self.postMessage({ type: "ready" });
}

function extractKeywordsWithSeparator(text, separator = "|") {
  if (typeof text !== "string") {
    console.warn("Expected a string but received:", text);
    text = JSON.stringify(text);
  }

  const keywords = text.split(separator).map((keyword) => keyword.trim());
  return keywords.filter((k) => k.length > 0).slice(0, 3);
}

async function generate_keywords(prompt) {
  const output = await generator(prompt, {
    max_new_tokens: 30,
    temperature: 0.5,
    top_p: 0.5,
    do_sample: true,
    early_stopping: true,
  });

  let generatedText = "";
  if (typeof output[0].generated_text === "string") {
    generatedText = output[0].generated_text;
  } else {
    try {
      generatedText = output[0].generated_text[2]["content"];
    } catch (err) {
      console.error("Error extracting generated_text from output:", err);
      generatedText = JSON.stringify(output[0].generated_text);
    }
  }

  const keywords = extractKeywordsWithSeparator(generatedText);

  return keywords;
}

async function generate_ideas(prompt) {
  const output = await generator(prompt, {
    max_new_tokens: 200,
    temperature: 0.7,
    top_p: 0.8,
    do_sample: true,
    early_stopping: true,
  });

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

  const ideas = extractKeywordsWithSeparator(generatedText, "|");
  console.log("Generated ideas:", ideas);
  return ideas;
}
