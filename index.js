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
    // Request user microphone with 16 kHz sample rate
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
      },
    });

    // Create an AudioContext at 16 kHz
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000,
      latencyHint: "interactive",
    });

    await audioContext.resume();

    // MediaStream source
    const source = audioContext.createMediaStreamSource(mediaStream);

    // ScriptProcessor with buffer size of 8192 (about 0.5s at 16kHz)
    // We'll accumulate two chunks to get ~1s total.
    processor = audioContext.createScriptProcessor(8192, 1, 1);

    // Constants for accumulation
    const SAMPLES_PER_SECOND = 16000;
    let audioBuffer = [];

    // Process audio data
    processor.onaudioprocess = (event) => {
      if (!isRecording) return;

      // Grab the audio samples from the left channel
      const inputData = event.inputBuffer.getChannelData(0);

      // Optional: check if there's a significant amplitude before we bother sending
      // If you'd like to capture everything (including very soft speech),
      // remove or lower this threshold check.
      const hasSignificantAudio = inputData.some(
        (sample) => Math.abs(sample) > 0.01
      );

      if (hasSignificantAudio) {
        // Accumulate samples in our buffer
        audioBuffer.push(...inputData);

        // Once we've collected at least 1 second of audio (16k samples), send it
        if (audioBuffer.length >= SAMPLES_PER_SECOND) {
          // Send the entire 1-second chunk to the transcription worker
          transcriptionWorker.postMessage({
            type: "transcribe",
            audioData: new Float32Array(audioBuffer),
          });

          // Reset the buffer
          audioBuffer = [];
        }
      }
    };

    // Connect everything
    source.connect(processor);
    processor.connect(audioContext.destination);

    // Let the worker know we’re starting a new session
    transcriptionWorker.postMessage({ type: "reset" });

    console.log("Audio capture started with 1s accumulation.");
  } catch (error) {
    console.error("Audio processing error:", error);
    throw error; // So your caller knows something failed
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
  console.log("Ideas:", ideas);
  ideas.forEach((idea) => {
    const card = document.createElement("div");
    card.className = "idea-card";
    card.draggable = true;

    card.innerHTML = `
      <p>${idea.text}</p>
    `;

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", idea.text);
    });

    ideasDisplay.appendChild(card);
  });
}
