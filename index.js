const transcriptionWorker = new Worker("worker.js", { type: "module" });
const keywordWorker = new Worker("keywordWorker.js", { type: "module" });
const btnStartTranscription = document.querySelector("#startTranscription");
const transcriptionDisplay = document.querySelector("#transcriptionDisplay");
const statusDisplay = document.querySelector("#statusDisplay");
const ideasDisplay = document.querySelector("#ideasDisplay");

let isRecording = false;
let mediaStream = null;
let audioContext = null;
let processor = null;
let isTranscriberReady = false;
let isKeywordWorkerReady = false;

transcriptionWorker.postMessage({ type: "load" });
keywordWorker.postMessage({ type: "load" });

transcriptionWorker.onmessage = (e) => {
  switch (e.data.type) {
    case "ready":
      console.log("Model ready");
      statusDisplay.textContent = "Ready to record";
      isTranscriberReady = true;
      btnStartTranscription.disabled = false;
      break;
    case "transcription":
      displayTranscription(e.data.text);
      break;
    case "error":
      console.error("Worker error:", e.data.message);
      statusDisplay.textContent = "Error: " + e.data.message;
      break;
  }
};

btnStartTranscription.onclick = async () => {
  if (!isTranscriberReady) return;

  if (!isRecording) {
    try {
      await startAudioProcessing();
      btnStartTranscription.textContent = "Stop Recording";
      statusDisplay.textContent = "Recording...";
      isRecording = true;
    } catch (error) {
      console.error("Failed to start recording:", error);
      statusDisplay.textContent = "Error: " + error.message;
    }
  } else {
    stopAudioProcessing();
    btnStartTranscription.textContent = "Start Recording";
    statusDisplay.textContent = "Stopped";
    isRecording = false;
  }
};

async function startAudioProcessing() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
      },
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000,
      latencyHint: "interactive",
    });

    await audioContext.resume();

    const source = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(8192, 1, 1);

    processor.onaudioprocess = (event) => {
      if (!isRecording) return;

      const inputData = event.inputBuffer.getChannelData(0);
      if (inputData.some((sample) => Math.abs(sample) > 0.01)) {
        transcriptionWorker.postMessage({
          type: "transcribe",
          audioData: new Float32Array(inputData),
        });
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    transcriptionWorker.postMessage({ type: "reset" });
    console.log("Audio capture started");
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

  processForIdeas(text);
}

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
      statusDisplay.textContent = "Error: " + e.data.message;
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

function checkWorkersReady() {
  if (isTranscriberReady && isKeywordWorkerReady) {
    statusDisplay.textContent = "Ready to record";
    btnStartTranscription.disabled = false;
  }
}

function processForIdeas(text) {
  keywordWorker.postMessage({
    type: "process",
    text: text,
  });
}

function displayIdeas(ideas) {
  ideas.forEach((idea) => {
    const card = document.createElement("div");
    card.className = "idea-card";
    card.draggable = true;

    card.innerHTML = `
      <p>${idea.text}</p>
      <div class="keywords">
        ${idea.keywords
          .map((kw) => `<span class="keyword-tag">${kw}</span>`)
          .join("")}
      </div>
    `;

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", idea.text);
    });

    ideasDisplay.appendChild(card);
  });
}
