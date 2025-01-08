// ========== Constants ==========
const SAMPLE_RATE = 16000; // 16 kHz sample rate
const BUFFER_SIZE = 8192; // Buffer size for the ScriptProcessor
const AMPLITUDE_THRESHOLD = 0.01; // Minimal amplitude to be considered "significant"
const ACCUMULATION_SECONDS = 1; // ~1 second accumulation (16k samples)

// ========== DOM References ==========
const btnStartTranscription = document.querySelector("#startTranscription");
const transcriptionDisplay = document.querySelector("#transcriptionDisplay");
const statusDisplay = document.querySelector("#statusDisplay");
const ideasDisplay = document.querySelector("#ideasDisplay");

// ========== Workers ==========
const transcriptionWorker = new Worker("worker.js", { type: "module" });
const keywordWorker = new Worker("keywordWorker.js", { type: "module" });

// ========== State Flags & Variables ==========
let isRecording = false;
let mediaStream = null;
let audioContext = null;
let processor = null;
let isTranscriberReady = false;
let isKeywordWorkerReady = false;

// ========== Init Workers ==========
transcriptionWorker.postMessage({ type: "load" });
keywordWorker.postMessage({ type: "load" });

// Handle messages from transcription worker
transcriptionWorker.onmessage = (e) => {
  switch (e.data.type) {
    case "ready":
      isTranscriberReady = true;
      checkWorkersReady();
      break;
    case "transcription":
      displayTranscription(e.data.text);
      processForIdeas(e.data.text);
      break;
    case "error":
      console.error("Transcription worker error:", e.data.message);
      updateStatus("Error: " + e.data.message);
      break;
  }
};

// Handle messages from keyword worker
keywordWorker.onmessage = (e) => {
  switch (e.data.type) {
    case "ready":
      isKeywordWorkerReady = true;
      checkWorkersReady();
      break;
    case "ideas":
      displayIdeas(e.data.ideas);
      break;
    case "error":
      console.error("Keyword worker error:", e.data.message);
      break;
  }
};

// ========== Event Listeners ==========
// Toggle recording when button is clicked
btnStartTranscription.onclick = async () => {
  if (!isTranscriberReady) return;

  if (!isRecording) {
    // Start recording
    try {
      await startAudioProcessing();
      btnStartTranscription.textContent = "Stop Recording";
      updateStatus("Recording...");
      isRecording = true;
    } catch (error) {
      console.error("Failed to start recording:", error);
      updateStatus("Error: " + error.message);
    }
  } else {
    // Stop recording
    stopAudioProcessing();
    btnStartTranscription.textContent = "Start Recording";
    updateStatus("Stopped");
    isRecording = false;
  }
};

// ========== Functions ==========

/**
 * Checks if both workers are ready.
 * If ready, enables the start button and updates status.
 */
function checkWorkersReady() {
  if (isTranscriberReady && isKeywordWorkerReady) {
    updateStatus("Ready to record");
    btnStartTranscription.disabled = false;
  }
}

/**
 * Updates the status display text.
 * @param {string} message
 */
function updateStatus(message) {
  statusDisplay.textContent = message;
}

/**
 * Starts audio capture and processing from the user's microphone.
 */
async function startAudioProcessing() {
  try {
    // Request user microphone with 16 kHz sample rate
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
      },
    });

    // Create an AudioContext at 16 kHz
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: SAMPLE_RATE,
      latencyHint: "interactive",
    });

    await audioContext.resume();

    // MediaStream source
    const source = audioContext.createMediaStreamSource(mediaStream);

    // ScriptProcessor for capturing audio data
    processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];

    // Process audio data
    processor.onaudioprocess = (event) => {
      if (!isRecording) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const hasSignificantAudio = inputData.some(
        (sample) => Math.abs(sample) > AMPLITUDE_THRESHOLD
      );

      if (hasSignificantAudio) {
        // Accumulate samples
        audioBuffer.push(...inputData);

        // Once we've collected ~1 second of audio, send it to the worker
        if (audioBuffer.length >= SAMPLE_RATE * ACCUMULATION_SECONDS) {
          transcriptionWorker.postMessage({
            type: "transcribe",
            audioData: new Float32Array(audioBuffer),
          });
          audioBuffer = [];
        }
      }
    };

    // Connect everything
    source.connect(processor);
    processor.connect(audioContext.destination);

    // Let the worker know we're starting a new session
    transcriptionWorker.postMessage({ type: "reset" });

    console.log("Audio capture started with ~1s accumulation.");
  } catch (error) {
    console.error("Audio processing error:", error);
    throw error; // Propagate error
  }
}

/**
 * Stops audio capture and cleans up resources.
 */
function stopAudioProcessing() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (processor) {
    processor.disconnect();
    processor = null;
  }

  if (audioContext && audioContext.state !== "closed") {
    audioContext.close();
    audioContext = null;
  }

  // Reset transcription worker session
  transcriptionWorker.postMessage({ type: "reset" });
}

/**
 * Appends the transcribed text to the transcription display.
 * @param {string} text
 */
function displayTranscription(text) {
  if (!text?.trim()) return;

  const p = document.createElement("p");
  p.textContent = text;
  transcriptionDisplay.appendChild(p);
  transcriptionDisplay.scrollTop = transcriptionDisplay.scrollHeight;
}

/**
 * Sends new text to the keyword worker for idea extraction.
 * @param {string} text
 */
function processForIdeas(text) {
  keywordWorker.postMessage({
    type: "process",
    text: text,
  });
}

/**
 * Displays idea cards in the ideas display container.
 * @param {Array} ideas
 */
function displayIdeas(ideas) {
  console.log("Ideas:", ideas);
  ideas.forEach((idea) => {
    ideasDisplay.appendChild(createIdeaCard(idea));
  });
}

/**
 * Creates a draggable idea card element.
 * @param {{ text: string }} idea
 * @returns {HTMLDivElement} A card element containing the idea text.
 */
function createIdeaCard(idea) {
  const card = document.createElement("div");
  card.className = "idea-card";
  card.draggable = true;
  card.innerHTML = `<p>${idea.text}</p>`;

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", idea.text);
  });

  return card;
}
