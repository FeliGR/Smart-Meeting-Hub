import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js";

const TASK_NAME = "automatic-speech-recognition";
const MODEL_NAME = "Xenova/whisper-tiny";
const SAMPLE_RATE = 16000;

let transcriber = null;
let isModelLoaded = false;
let audioBuffer = [];

self.onmessage = async (e) => {
  switch (e.data.type) {
    case "load":
      await loadModel();
      break;
    case "transcribe":
      if (!isModelLoaded) {
        self.postMessage({
          type: "error",
          message: "Model not loaded yet",
        });
        return;
      }
      processAudioChunk(e.data.audioData);
      break;
    case "reset":
      audioBuffer = [];
      break;
  }
};

async function loadModel() {
  try {
    console.log("Loading Whisper model...");
    transcriber = await pipeline(TASK_NAME, MODEL_NAME, {
      device: "cpu",
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "es",
      task_config: {
        use_vad: true,
      },
    });
    isModelLoaded = true;
    self.postMessage({ type: "ready" });
  } catch (error) {
    console.error("Model loading error:", error);
    self.postMessage({
      type: "error",
      message: error.message,
    });
  }
}

function processAudioChunk(audioData) {
  if (!audioData || audioData.length === 0) return;

  audioBuffer = audioBuffer.concat(Array.from(audioData));
  console.log("Buffer size:", audioBuffer.length);

  if (audioBuffer.length >= SAMPLE_RATE) {
    const audioToProcess = new Float32Array(audioBuffer.slice(0, SAMPLE_RATE));

    const maxLevel = Math.max(...audioToProcess.map(Math.abs));
    console.log("Max audio level:", maxLevel);

    if (maxLevel > 0.01) {
      transcribeAudio(audioToProcess);
    }

    audioBuffer = audioBuffer.slice(SAMPLE_RATE);
  }
}

async function transcribeAudio(audioData) {
  try {
    console.log("Starting transcription...");
    const result = await transcriber(audioData, {
      sampling_rate: SAMPLE_RATE,
      return_timestamps: false,
      language: "es",
    });

    console.log("Raw transcription result:", result);

    if (result && result.text && result.text.trim()) {
      console.log("Sending transcription:", result.text);
      self.postMessage({
        type: "transcription",
        text: result.text.trim(),
      });
    } else {
      console.log("No transcription result");
    }
  } catch (error) {
    console.error("Transcription error:", error);
    self.postMessage({
      type: "error",
      message: "Transcription failed: " + error.message,
    });
  }
}
