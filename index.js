// ========== IMPORTS ==========
import * as detection from "./detection.js";

// ========== Constants ==========
const SAMPLE_RATE = 16000; // 16 kHz sample rate
const BUFFER_SIZE = 8192; // Tamaño del buffer para ScriptProcessor
const AMPLITUDE_THRESHOLD = 0.01; // Nivel mínimo para considerar audio "significativo"
const ACCUMULATION_SECONDS = 1; // Aproximadamente 1 segundo de acumulación

// ========== DOM References ==========
const btnStartTranscription = document.querySelector("#startTranscription");
const transcriptionDisplay = document.querySelector("#transcriptionDisplay");
const statusDisplay = document.querySelector("#statusDisplay");
const ideasDisplay = document.querySelector("#ideasDisplay");

// Elemento para notificaciones de detección
const detectionStatusEl = document.getElementById("detectionStatus");

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

// ========== Inicialización de los Workers ==========
transcriptionWorker.postMessage({ type: "load" });
keywordWorker.postMessage({ type: "load" });

// ========== Manejadores de Mensajes de los Workers ==========
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

// ========== Event Listener para el botón de transcripción ==========
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

// ========== Funciones de Transcripción e Ideas ==========
function checkWorkersReady() {
  if (isTranscriberReady && isKeywordWorkerReady) {
    updateStatus("Ready to record");
    btnStartTranscription.disabled = false;
  }
}

function updateStatus(message) {
  statusDisplay.textContent = message;
}

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

    processor.onaudioprocess = (event) => {
      if (!isRecording) return;
      const inputData = event.inputBuffer.getChannelData(0);
      const hasSignificantAudio = inputData.some(
        (sample) => Math.abs(sample) > AMPLITUDE_THRESHOLD
      );
      if (hasSignificantAudio) {
        audioBuffer.push(...inputData);
        if (audioBuffer.length >= SAMPLE_RATE * ACCUMULATION_SECONDS) {
          transcriptionWorker.postMessage({
            type: "transcribe",
            audioData: new Float32Array(audioBuffer),
          });
          audioBuffer = [];
        }
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    transcriptionWorker.postMessage({ type: "reset" });
    console.log("Audio capture started with ~1s accumulation.");
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

// ========== Integración de Detección Visual (COCO-SSD) ==========
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
  if (isNewPerson) {
    document.getElementById("detectionStatus").textContent =
      "New participant detected!";
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

// Inicia la detección en paralelo al cargar la aplicación
window.addEventListener("load", () => {
  startDetection();
});
