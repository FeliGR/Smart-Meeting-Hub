// detection.js

let model = null;
let currentPersonCount = 0;
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 1000; // 1 second between detections
const CONFIDENCE_THRESHOLD = 0.65; // Increased confidence threshold
const PERSON_ENTER_TIMEOUT = 3000; // Time to confirm new person

/**
 * Carga el modelo COCO-SSD.
 */
export async function loadDetectionModel() {
  model = await cocoSsd.load();
  console.log("COCO-SSD model loaded for detection.");
}

/**
 * Inicia el video stream usando el elemento con id "detectionVideo".
 */
export async function startVideoStream() {
  const videoElement = document.getElementById("detectionVideo");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("getUserMedia() is not supported by your browser.");
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = stream;
    await videoElement.play();
    return videoElement;
  } catch (error) {
    console.error("Error accessing the camera:", error);
    throw error;
  }
}

/**
 * Realiza la detección en el frame actual del video.
 * Retorna true si se detecta un aumento en la cantidad de personas.
 */
export async function detectPeople(videoElement) {
  if (!model) {
    console.warn("Detection model is not loaded.");
    return false;
  }
  const predictions = await model.detect(videoElement);
  // Filtrar detecciones de la clase 'person' con score > 0.5
  const persons = predictions.filter(
    (prediction) => prediction.class === "person" && prediction.score > 0.5
  );
  const newCount = persons.length;
  const isNewParticipant = newCount > currentPersonCount;
  currentPersonCount = newCount;
  console.log("Persons detected:", newCount);
  return isNewParticipant;
}

/**
 * Detiene el stream de video.
 */
export function stopVideoStream() {
  const videoElement = document.getElementById("detectionVideo");
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
}
