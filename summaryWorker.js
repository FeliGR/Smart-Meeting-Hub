// summaryWorker.js
import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js";

const PIPELINE_TASK = "summarization";
const MODEL_NAME = "Xenova/distilbart-cnn-6-6";
const LOAD_TIMEOUT = 60000;

let summarizer = null;
let isLoading = false;

self.onmessage = async (e) => {
  try {
    switch (e.data.type) {
      case "load":
        if (!isLoading && !summarizer) {
          await loadModelWithTimeout();
        }
        break;
      case "summarize":
        // Ensure that the prompt (or text) is provided as a string.
        if (typeof e.data.prompt !== "string") {
          throw new Error("Expected the prompt to be a string");
        }
        await summarizeText(e.data.prompt);
        break;
      default:
        console.warn("Unknown message type:", e.data);
    }
  } catch (error) {
    postMessage({ type: "error", message: error.message });
  }
};

async function loadModelWithTimeout() {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error("Model loading timed out")),
      LOAD_TIMEOUT
    );
  });

  try {
    isLoading = true;
    postMessage({ type: "loading", status: "started" });
    await Promise.race([loadModel(), timeoutPromise]);
    postMessage({ type: "ready" });
  } catch (error) {
    console.error("Error loading model:", error);
    postMessage({
      type: "error",
      message: `Failed to load model: ${error.message}`,
    });
  } finally {
    isLoading = false;
  }
}

async function loadModel() {
  try {
    console.log(`Loading summarization model: ${MODEL_NAME}`);
    summarizer = await pipeline(PIPELINE_TASK, MODEL_NAME);
    console.log("Model loaded successfully");
    return summarizer;
  } catch (error) {
    throw new Error(`Model initialization failed: ${error.message}`);
  }
}

async function summarizeText(text) {
  if (!summarizer) {
    throw new Error("Model not loaded. Please load the model first.");
  }

  try {

    console.log(text)
    const result = await summarizer(text, {
      max_new_tokens: 100,
    });
    
    const summary = result[0].summary_text;

    console.log(`Summarized text: ${summary}`);
    
    postMessage({ type: "summary", summary });
  } catch (error) {
    throw new Error(`Summarization failed: ${error.message}`);
  }
}
