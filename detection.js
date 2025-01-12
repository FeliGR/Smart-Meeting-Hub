let model = null;
let currentPersonCount = 0;
let lastDetectionTime = 0;
let personHistory = [];
const HISTORY_SIZE = 5;
const DETECTION_INTERVAL = 1000;
const CONFIDENCE_THRESHOLD = 0.65;

export async function loadDetectionModel() {
  model = await cocoSsd.load();
  console.log("COCO-SSD model loaded for detection.");
}

export async function startVideoStream() {
  const videoElement = document.getElementById("detectionVideo");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("getUserMedia() is not supported by your browser.");
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15 },
      },
    });
    videoElement.srcObject = stream;
    await videoElement.play();
    return videoElement;
  } catch (error) {
    console.error("Error accessing the camera:", error);
    throw error;
  }
}

export async function detectPeople(videoElement) {
  const now = Date.now();
  if (now - lastDetectionTime < DETECTION_INTERVAL) {
    return null;
  }
  lastDetectionTime = now;

  if (!model) {
    console.warn("Detection model is not loaded.");
    return null;
  }

  try {
    const predictions = await model.detect(videoElement);
    const persons = predictions.filter(
      (pred) => pred.class === "person" && pred.score > CONFIDENCE_THRESHOLD
    );

    personHistory.push(persons.length);
    if (personHistory.length > HISTORY_SIZE) {
      personHistory.shift();
    }

    const avgCount = Math.round(
      personHistory.reduce((a, b) => a + b, 0) / personHistory.length
    );

    const isNewParticipant = avgCount > currentPersonCount;
    if (isNewParticipant) {
      setTimeout(() => {
        currentPersonCount = avgCount;
      }, 2000);
    }

    return {
      isNewPerson: isNewParticipant,
      count: avgCount,
      boxes: persons.map((p) => ({
        bbox: p.bbox,
        score: p.score,
      })),
    };
  } catch (error) {
    console.error("Detection error:", error);
    return null;
  }
}

export function stopVideoStream() {
  const videoElement = document.getElementById("detectionVideo");
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
  personHistory = [];
  currentPersonCount = 0;
}
