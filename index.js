const worker = new Worker("worker.js", { type: "module" });
const btnStartTranscription = document.querySelector("#startTranscription");
const transcriptionDisplay = document.querySelector("#transcriptionDisplay");
const statusDisplay = document.querySelector("#statusDisplay");

let isWorkerReady = false;

// Enviar mensaje al Worker para cargar el modelo
worker.postMessage({ type: "load" });

worker.onmessage = (e) => {
  switch (e.data.type) {
    case "ready":
      console.log("Modelo listo para transcribir.");
      statusDisplay.textContent = "El modelo está listo para usar.";
      isWorkerReady = true;
      break;
    case "transcription":
      displayTranscription(e.data.text);
      break;
    case "error":
      console.error("Error en el Worker:", e.data.message);
      statusDisplay.textContent = "Error: " + e.data.message;
      break;
    default:
      console.warn("Mensaje desconocido del Worker:", e.data.type);
  }
};

btnStartTranscription.onclick = async () => {
  if (!isWorkerReady) {
    console.warn("El modelo aún no está listo. Espera un momento.");
    statusDisplay.textContent =
      "El modelo aún no está listo. Espera un momento.";
    return;
  }
  statusDisplay.textContent = "Iniciando procesamiento de audio...";
  await startAudioProcessing();
};

async function startAudioProcessing() {
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);
    const audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

    const audioBuffer = [];

    audioProcessor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0); // Obtener datos del canal 0
      const float32Audio = new Float32Array(inputData); // Convertir a Float32Array
      worker.postMessage({ type: "transcribe", audioData: float32Audio });
    };

    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);

    console.log("Procesamiento de audio iniciado.");
    statusDisplay.textContent = "Procesando audio...";
  } catch (error) {
    console.error("Error al procesar audio:", error);
    statusDisplay.textContent = "Error: " + error.message;
  }
}

function displayTranscription(text) {
  const p = document.createElement("p");
  p.textContent = text;
  transcriptionDisplay.appendChild(p);
}
