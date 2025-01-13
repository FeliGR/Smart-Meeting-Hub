// ========== Imports ==========
import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js";

// ========== Constants ==========
const TASK_NAME = "automatic-speech-recognition";
const MODEL_NAME = "Xenova/whisper-base";
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

// Define a real-time chunk size (matching the main thread)
const REALTIME_CHUNK_SIZE = Math.floor(SAMPLE_RATE * 3.5); // 0.5 seconds

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
 * Processes a chunk of audio data.
 * For a real-time approach, we process immediately if the incoming data is at least our chunk size.
 * @param {Float32Array} audioData
 */
function processAudioChunk(audioData) {
  if (!audioData || audioData.length === 0) return;

  // Accumulate incoming data into audioBuffer
  audioBuffer = audioBuffer.concat(Array.from(audioData));
  console.log("Worker buffer size:", audioBuffer.length);

  // Process immediately if we have at least one chunk's worth of data.
  if (audioBuffer.length >= REALTIME_CHUNK_SIZE) {
    const audioToProcess = new Float32Array(
      audioBuffer.slice(0, REALTIME_CHUNK_SIZE)
    );

    // Check maximum amplitude
    const maxLevel = Math.max(...audioToProcess.map(Math.abs));
    console.log("Worker max audio level:", maxLevel);

    if (maxLevel > MIN_LEVEL_THRESHOLD) {
      transcribeAudio(audioToProcess);
    }
    // Remove processed samples from buffer.
    // (If needed, you can choose to keep an overlap here by slicing fewer samples.)
    audioBuffer = audioBuffer.slice(REALTIME_CHUNK_SIZE);
  }
}

/**
 * Transcribes the given audio data using the loaded Whisper model.
 * @param {Float32Array} audioData
 */
async function transcribeAudio(audioData) {
  try {
    console.log("Starting transcription on chunk...");
    // Language override can be applied if needed.
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
      console.log("No transcription result for chunk");
    }
  } catch (error) {
    console.error("Transcription error:", error);
    postError("Transcription failed: " + error.message);
  }
}

// ========== Helper Functions ==========

/**
 * Sends a general message to the main thread.
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
  self.postMessage({ type: "error", message: errorMessage });
}
