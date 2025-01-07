// Importa directamente desde el CDN
import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js";

const TASK_NAME = "automatic-speech-recognition";
const MODEL_NAME = "Xenova/whisper-tiny";

let transcriber = null;
let isModelLoaded = false;

// Manejo de mensajes del Worker
self.onmessage = async (e) => {
  switch (e.data.type) {
    case "load":
      await loadModel();
      break;
    case "transcribe":
      if (!isModelLoaded) {
        console.error("El modelo no está cargado.");
        self.postMessage({
          type: "error",
          message: "El modelo no está cargado. Por favor espera.",
        });
        return;
      }
      await transcribeAudio(e.data.audioData);
      break;
    default:
      console.warn("Tipo de mensaje desconocido:", e.data.type);
  }
};

// Cargar el modelo Whisper
async function loadModel() {
  try {
    console.log("Cargando modelo Whisper...");
    transcriber = await pipeline(TASK_NAME, MODEL_NAME, {
      device: "cpu", // Usar CPU para evitar problemas de compatibilidad
    });
    isModelLoaded = true;
    console.log("Modelo Whisper cargado correctamente.");
    self.postMessage({ type: "ready" });
  } catch (error) {
    console.error("Error al cargar el modelo:", error);
    self.postMessage({
      type: "error",
      message: "Error al cargar el modelo: " + error.message,
    });
  }
}

// Transcribir audio
async function transcribeAudio(audioData) {
  try {
    console.log("Iniciando transcripción...");
    const result = await transcriber(audioData);
    console.log("Transcripción completada:", result.text);
    console.log(result)
    self.postMessage({ type: "transcription", text: result.text });
  } catch (error) {
    console.error("Error durante la transcripción:", error);
    self.postMessage({
      type: "error",
      message: "Error en la transcripción: " + error.message,
    });
  }
}
