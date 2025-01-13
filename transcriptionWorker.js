// ========== Imports ==========
import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js";

// ========== Constants ==========
const TASK_NAME = "automatic-speech-recognition";
const MODEL_NAME = "Xenova/whisper-tiny";
const SAMPLE_RATE = 16000;
const MIN_LEVEL_THRESHOLD = 0.01;
const MODEL_CONFIG = {
  device: "cpu",
  chunk_length_s: 30,
  stride_length_s: 5,
  language: "es",
  task_config: {
    use_vad: true,
  },
};

// ========== Worker State ==========
let transcriber = null;
let isModelLoaded = false;
let audioBuffer = [];

// ========== Worker Event Handler ==========
self.onmessage = async (e) => {
  switch (e.data.type) {
    case "load":
      await loadModel();
      break;
    case "transcribe":
      if (!isModelLoaded) {
        postError("Model not loaded yet");
        return;
      }
      processAudioChunk(e.data.audioData);
      break;
    case "reset":
      audioBuffer = [];
      break;
  }
};

// ========== Main Functions ==========

/**
 * Loads the Whisper model using Xenova's Transformers pipeline.
 */
async function loadModel() {
  try {
    console.log("Loading Whisper model...");
    transcriber = await pipeline(TASK_NAME, MODEL_NAME, MODEL_CONFIG);
    isModelLoaded = true;
    postMessageToClient("ready");
  } catch (error) {
    console.error("Model loading error:", error);
    postError(error.message);
  }
}

/**
 * Processes a chunk of audio data, accumulating it in a buffer.
 * If the buffer has at least SAMPLE_RATE samples, it tries to transcribe.
 * @param {Float32Array} audioData
 */
function processAudioChunk(audioData) {
  if (!audioData || audioData.length === 0) return;

  audioBuffer = audioBuffer.concat(Array.from(audioData));
  console.log("Buffer size:", audioBuffer.length);

  // Once we have at least 1 second of audio (SAMPLE_RATE samples), attempt transcription
  if (audioBuffer.length >= SAMPLE_RATE) {
    const audioToProcess = new Float32Array(audioBuffer.slice(0, SAMPLE_RATE));

    // Check the maximum amplitude for a minimal threshold
    const maxLevel = Math.max(...audioToProcess.map(Math.abs));
    console.log("Max audio level:", maxLevel);

    if (maxLevel > MIN_LEVEL_THRESHOLD) {
      transcribeAudio(audioToProcess);
    }

    // Remove processed samples from the buffer
    audioBuffer = audioBuffer.slice(SAMPLE_RATE);
  }
}

/**
 * Transcribes the given audio data using the loaded Whisper model.
 * @param {Float32Array} audioData
 */
async function transcribeAudio(audioData) {
  try {
    console.log("Starting transcription...");
    // Even though 'language' was set to 'es' in MODEL_CONFIG, we can override for this call
    const result = await transcriber(audioData, {
      sampling_rate: SAMPLE_RATE,
      return_timestamps: false,
      language: "en",
    });

    console.log("Raw transcription result:", result);

    if (result?.text?.trim()) {
      console.log("Sending transcription:", result.text);
      postMessageToClient("transcription", { text: result.text.trim() });
    } else {
      console.log("No transcription result");
    }
  } catch (error) {
    console.error("Transcription error:", error);
    postError("Transcription failed: " + error.message);
  }
}

// ========== Helper Functions ==========

/**
 * Sends a general message to the main thread with a given type and optional payload.
 * @param {string} type
 * @param {Object} [payload={}]
 */
function postMessageToClient(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

/**
 * Sends an error message to the main thread.
 * @param {string} errorMessage
 */
function postError(errorMessage) {
  self.postMessage({
    type: "error",
    message: errorMessage,
  });
}
