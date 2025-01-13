// ========== IMPORTS ==========
import * as detection from "./detection.js";

// ========== Constants ==========
const SAMPLE_RATE = 16000; // 16 kHz sample rate
const BUFFER_SIZE = 8192; // Buffer size for ScriptProcessor
const AMPLITUDE_THRESHOLD = 0.01; // Minimum level to consider "significant" audio

// Ajusta estos parámetros para procesar oraciones más largas
const SILENCE_THRESHOLD = 2.0; // Segundos de silencio para disparar el procesamiento (antes 1.0)
const MAX_BUFFER_DURATION = 15.0; // Máxima duración en segundos a acumular antes de forzar el procesamiento

// ========== DOM References ==========
const btnStartTranscription = document.querySelector("#startTranscription");
const transcriptionDisplay = document.querySelector("#transcriptionDisplay");
const statusDisplay = document.querySelector("#statusDisplay");
const ideasDisplay = document.querySelector("#ideasDisplay");

// ========== Workers ==========
const transcriptionWorker = new Worker("transcriptionWorker.js", {
  type: "module",
});
const keywordWorker = new Worker("keywordWorker.js", { type: "module" });
const summaryWorker = new Worker("summaryWorker.js", { type: "module" });

// ========== State Flags & Variables ==========
let isRecording = false;
let mediaStream = null;
let audioContext = null;
let processor = null;
let isTranscriberReady = false;
let isKeywordWorkerReady = false;
let isSummaryWorkerReady = false;
let accumulatedTranscription = ""; // Variable para almacenar toda la transcripción

// ========== Workers Initialization ==========
transcriptionWorker.postMessage({ type: "load" });
keywordWorker.postMessage({ type: "load" });
summaryWorker.postMessage({ type: "load" });

// ========== Worker Message Handlers ==========
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

summaryWorker.onmessage = (e) => {
  switch (e.data.type) {
    case "ready":
      isSummaryWorkerReady = true;
      console.log("Resumen listo");
      break;
    case "summary":
      displaySummary(e.data.summary);
      break;
    case "error":
      console.error("Summary worker error:", e.data.message);
      break;
  }
};

// ========== Transcription Button Event Listener ==========
btnStartTranscription.onclick = async () => {
  if (!isTranscriberReady) return;

  if (!isRecording) {
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
    stopAudioProcessing();
    btnStartTranscription.textContent = "Start Recording";
    updateStatus("Stopped");
    isRecording = false;
  }
};

// ========== Workers Ready Check ==========
function checkWorkersReady() {
  if (isTranscriberReady && isKeywordWorkerReady && isSummaryWorkerReady) {
    updateStatus("Ready to record");
    btnStartTranscription.disabled = false;
  }
}

function updateStatus(message) {
  statusDisplay.textContent = message;
}

// ========== Transcription and Ideas Functions ==========
async function startAudioProcessing() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: SAMPLE_RATE },
    });
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: SAMPLE_RATE,
      latencyHint: "interactive",
    });
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    let silenceCounter = 0;

    processor.onaudioprocess = (event) => {
      if (!isRecording) return;
      const inputData = event.inputBuffer.getChannelData(0);

      // Add all audio data to buffer
      audioBuffer.push(...inputData);

      // Check for significant audio
      const hasSignificantAudio = inputData.some(
        (sample) => Math.abs(sample) > AMPLITUDE_THRESHOLD
      );

      if (hasSignificantAudio) {
        silenceCounter = 0; // Reset silence counter on speech
      } else {
        silenceCounter += BUFFER_SIZE / SAMPLE_RATE;
      }

      const bufferDuration = audioBuffer.length / SAMPLE_RATE;

      // Process if we have long silence OR buffer is very long
      if (
        (silenceCounter >= SILENCE_THRESHOLD && bufferDuration > 2.0) ||
        bufferDuration >= MAX_BUFFER_DURATION
      ) {
        if (audioBuffer.length > 0) {
          // Send larger chunks to worker
          transcriptionWorker.postMessage({
            type: "transcribe",
            audioData: new Float32Array(audioBuffer),
          });
          audioBuffer = []; // Clear after sending
          silenceCounter = 0;
        }
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    transcriptionWorker.postMessage({ type: "reset" });
    console.log("Audio capture started with silence detection");
  } catch (error) {
    console.error("Audio processing error:", error);
    throw error;
  }
}

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
  transcriptionWorker.postMessage({ type: "reset" });
}

function displayTranscription(text) {
  if (!text?.trim()) return;
  accumulatedTranscription += " " + text;

  const p = document.createElement("p");
  p.textContent = text;
  transcriptionDisplay.appendChild(p);
  transcriptionDisplay.scrollTop = transcriptionDisplay.scrollHeight;
}

function processForIdeas(text) {
  keywordWorker.postMessage({ type: "process", text: text });
}

function displayIdeas(ideas) {
  console.log("Ideas:", ideas);
  ideas.forEach((idea) => {
    ideasDisplay.appendChild(createIdeaCard(idea));
  });
}

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

// ========== Visual Detection Integration (COCO-SSD) ==========
let detectionActive = false;
let detectionVideoElement = null;
let canvas = null;
let ctx = null;

function initializeCanvas() {
  canvas = document.getElementById("detectionOverlay");
  ctx = canvas.getContext("2d");
  canvas.width = 640;
  canvas.height = 480;
}

function drawDetectionBoxes(boxes) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 2;
  ctx.font = "12px Arial";
  ctx.fillStyle = "#00ff00";

  boxes.forEach(({ bbox, score }) => {
    const [x, y, width, height] = bbox;
    ctx.strokeRect(x, y, width, height);
    ctx.fillText(`${Math.round(score * 100)}%`, x, y - 5);
  });
}

function updateDetectionUI(count, isNewPerson) {
  document.getElementById(
    "personCounter"
  ).textContent = `Participants: ${count}`;
  const detectionStatusElement = document.getElementById("detectionStatus");

  if (isNewPerson) {
    detectionStatusElement.textContent = "New participant detected!";
    if (isSummaryWorkerReady && accumulatedTranscription.trim().length > 0) {
      summaryWorker.postMessage({
        type: "summarize",
        text: accumulatedTranscription,
      });
    }
  } else {
    detectionStatusElement.textContent = "Detection running...";
  }
}

async function runDetectionLoop() {
  if (!detectionActive) return;

  const result = await detection.detectPeople(detectionVideoElement);
  if (result) {
    drawDetectionBoxes(result.boxes);
    updateDetectionUI(result.count, result.isNewPerson);
  }

  requestAnimationFrame(runDetectionLoop);
}

async function startDetection() {
  try {
    await detection.loadDetectionModel();

    detectionActive = true;
    initializeCanvas();

    detectionVideoElement = await detection.startVideoStream();
    runDetectionLoop();
  } catch (error) {
    console.error("Detection setup error:", error);
    document.getElementById(
      "detectionStatus"
    ).textContent = `Detection error: ${error.message}`;
  }
}

export function stopDetection() {
  detectionActive = false;
  if (detectionVideoElement) {
    detection.stopVideoStream();
    detectionVideoElement = null;
  }
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// Start detection in parallel when loading the application
window.addEventListener("load", () => {
  startDetection();
});

window.allowDrop = function (ev) {
  ev.preventDefault();
};

window.handleDrop = function (ev) {
  ev.preventDefault();
  const text = ev.dataTransfer.getData("text/plain");

  const droppedCard = document.createElement("div");
  droppedCard.className = "idea-card";
  droppedCard.innerHTML = `<p>${text}</p>`;

  const dropZone =
    ev.target.closest(".drop-zone") || ev.target.closest("#ideasDisplay");
  if (dropZone) {
    dropZone.appendChild(droppedCard);
  }
};

document.querySelectorAll(".drop-zone").forEach((zone) => {
  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });

  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
  });
});

function displaySummary(summary) {
  const summaryDisplay = document.getElementById("summaryDisplay");
  summaryDisplay.textContent = summary;
}
