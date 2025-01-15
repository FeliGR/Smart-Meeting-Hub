// ========== IMPORTS ==========
import * as detection from "./detection.js";

// ========== Constants ==========
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 8192;
const AMPLITUDE_THRESHOLD = 0.01;

// Real-time chunking constants:
const REALTIME_CHUNK_SIZE = Math.floor(SAMPLE_RATE * 3.5);
const OVERLAP_SIZE = Math.floor(REALTIME_CHUNK_SIZE * 0.25);

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
let accumulatedTranscription = "";

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
    case "keywords":
      displayKeyWords(e.data.keywords);
      generateIdeasFromKeywords(e.data.keywords);
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
      console.log("Summary worker ready");
      break;
    case "summary":
      console.log("Summary worker response:", e.data.summary);
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

    processor.onaudioprocess = (event) => {
      if (!isRecording) return;
      const inputData = event.inputBuffer.getChannelData(0);
      audioBuffer.push(...inputData);

      while (audioBuffer.length >= REALTIME_CHUNK_SIZE) {
        const chunk = new Float32Array(
          audioBuffer.slice(0, REALTIME_CHUNK_SIZE)
        );
        audioBuffer = audioBuffer.slice(REALTIME_CHUNK_SIZE - OVERLAP_SIZE);

        const maxLevel = Math.max(...chunk.map(Math.abs));
        if (maxLevel > AMPLITUDE_THRESHOLD) {
          transcriptionWorker.postMessage({
            type: "transcribe",
            audioData: chunk,
          });
        }
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    transcriptionWorker.postMessage({ type: "reset" });
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

  if (accumulatedTranscription.trim().length > 0) {
    ideasDisplay.innerHTML = "";

    const content = `I have the following text: ${accumulatedTranscription}.
Based on the text above, generate exactly THREE NEW and APPROPRIATE keywords that capture the overall topic of the text.
Do not simply extract existing words from the text—choose terms that encapsulate the essence of the subject.
Return only a single line of text with exactly three words separated by the "|" character (pipe symbol) and no other text or punctuation.
For example, if the text is about the education system, an acceptable response would be:
School | Student | Music
**Do NOT use the keywords provided in the example.**`;

    const prompt = [
      {
        role: "system",
        content:
          "You are a keyword expert. Your objective is to generate innovative and appropriate keywords that capture the essence of a given text.",
      },
      { role: "user", content: content },
    ];

    keywordWorker.postMessage({
      type: "keywords",
      prompt: prompt,
    });
  }
}

function displayTranscription(text) {
  if (!text?.trim()) return;
  const formattedText = text.trim();
  const shouldAddPeriod =
    !accumulatedTranscription.endsWith(".") &&
    !accumulatedTranscription.endsWith("?") &&
    !accumulatedTranscription.endsWith("!");

  if (accumulatedTranscription.length === 0) {
    accumulatedTranscription = formattedText;
  } else {
    accumulatedTranscription += (shouldAddPeriod ? ". " : " ") + formattedText;
  }
  transcriptionDisplay.textContent = accumulatedTranscription;
  transcriptionDisplay.scrollTop = transcriptionDisplay.scrollHeight;
}

function displayKeyWords(keywords) {
  ideasDisplay.innerHTML = "";
  keywords.forEach((keyword) => {
    const card = document.createElement("div");
    card.className = "idea-card";
    card.draggable = true;

    const label = document.createElement("div");
    label.className = "keyword-label";
    label.textContent = "Keyword";

    const keywordText = typeof keyword === "string" ? keyword : keyword.text;
    const tag = document.createElement("div");
    tag.className = "keyword-tag";
    tag.textContent = keywordText;

    card.appendChild(label);
    card.appendChild(tag);

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", keywordText);
    });

    ideasDisplay.appendChild(card);
  });
}

function generateIdeasFromKeywords(keywords) {
  const keywordList = keywords.join(" | ");
  let content = `I have the following keywords: ${keywordList}.
Based on these keywords, generate exactly THREE innovative and precise ideas that best describe the topic.
Return your response as one SMALL and CONCISE sentece that naturally integrates all three ideas.
Do not use list formatting, extra symbols, or provide additional explanation—just a single, well-formed SENTENCE.`;

  const prompt = [
    {
      role: "system",
      content:
        "You are a creative generator whose objective is to generate ideas from a given list of keywords.",
    },
    { role: "user", content: content },
  ];

  console.log("Generating ideas for keywords:", keywordList);

  keywordWorker.postMessage({
    type: "ideas",
    prompt: prompt,
  });
}

function displayIdeas(ideasText) {
  if (typeof ideasText !== "string") {
    console.warn("displayIdeas: Expected a string for ideasText", ideasText);
    return;
  }
  const trimmedIdeas = ideasText.trim();

  ideasDisplay.innerHTML = "";

  const card = document.createElement("div");
  card.className = "idea-card";
  card.draggable = true;

  const label = document.createElement("div");
  label.className = "idea-label";
  label.textContent = "Ideas";

  const tag = document.createElement("div");
  tag.className = "idea-tag";
  tag.textContent = trimmedIdeas;

  card.appendChild(label);
  card.appendChild(tag);

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", trimmedIdeas);
  });

  ideasDisplay.appendChild(card);
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
      console.log("Sending accumulated transcription to summary worker");
      summaryWorker.postMessage({
        type: "summarize",
        prompt: accumulatedTranscription,
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

// Start detection in parallel when loading the application.
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
