// ========== Constants ==========
const CONFIG = {
  HISTORY_SIZE: 5,
  DETECTION_INTERVAL: 1000,
  CONFIDENCE_THRESHOLD: 0.65,
  DEBOUNCE_TIME: 2000,
  VIDEO: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 15 },
  },
};

// ========== State management ==========
const state = {
  model: null,
  currentPersonCount: 0,
  lastDetectionTime: 0,
  personHistory: [],
  isActive: false,
};

/**
 * Loads and initializes the COCO-SSD model
 * @throws {Error} If model fails to load
 */
export async function loadDetectionModel() {
  try {
    state.model = await cocoSsd.load();
    console.log("COCO-SSD model loaded for detection.");
    state.isActive = true;
  } catch (error) {
    console.error("Failed to load detection model:", error);
    throw new Error("Model initialization failed");
  }
}

/**
 * Initializes video stream with optimal settings
 * @returns {HTMLVideoElement} Configured video element
 */
export async function startVideoStream() {
  const videoElement = document.getElementById("detectionVideo");

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia() is not supported");
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: CONFIG.VIDEO,
    });

    videoElement.srcObject = stream;
    await videoElement.play();

    // Reset detection state
    state.personHistory = [];
    state.currentPersonCount = 0;

    return videoElement;
  } catch (error) {
    console.error("Camera access error:", error);
    throw new Error("Failed to start video stream");
  }
}

/**
 * Detects people in video frame
 * @param {HTMLVideoElement} videoElement Video source
 * @returns {Object|null} Detection results
 */
export async function detectPeople(videoElement) {
  if (!state.isActive || !state.model) {
    console.warn("Detection inactive or model not loaded");
    return null;
  }

  // Rate limiting
  const now = Date.now();
  if (now - state.lastDetectionTime < CONFIG.DETECTION_INTERVAL) {
    return null;
  }
  state.lastDetectionTime = now;

  try {
    const predictions = await state.model.detect(videoElement);

    // Filter and process detections
    const persons = predictions.filter(
      (pred) =>
        pred.class === "person" && pred.score > CONFIG.CONFIDENCE_THRESHOLD
    );

    // Update rolling average
    state.personHistory.push(persons.length);
    if (state.personHistory.length > CONFIG.HISTORY_SIZE) {
      state.personHistory.shift();
    }

    const avgCount = Math.round(
      state.personHistory.reduce((a, b) => a + b, 0) /
        state.personHistory.length
    );

    // Check for new participants
    const isNewPerson = avgCount > state.currentPersonCount;
    if (isNewPerson) {
      debouncePersonCountUpdate(avgCount);
    }

    return {
      isNewPerson,
      count: avgCount,
      boxes: persons.map((p) => ({
        bbox: p.bbox,
        score: p.score,
      })),
      timestamp: now,
    };
  } catch (error) {
    console.error("Detection error:", error);
    return null;
  }
}

/**
 * Debounces person count updates to prevent flickering
 */
function debouncePersonCountUpdate(newCount) {
  setTimeout(() => {
    state.currentPersonCount = newCount;
  }, CONFIG.DEBOUNCE_TIME);
}

/**
 * Stops video stream and cleans up resources
 */
export function stopVideoStream() {
  const videoElement = document.getElementById("detectionVideo");

  if (videoElement?.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }

  // Reset state
  state.personHistory = [];
  state.currentPersonCount = 0;
  state.isActive = false;
  state.lastDetectionTime = 0;
}

/**
 * Cleanup all detection resources
 */
export function cleanup() {
  stopVideoStream();
  state.model = null;
}
