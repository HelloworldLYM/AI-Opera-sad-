let visionModule = null;

async function loadVisionModule() {
  if (!visionModule) {
    visionModule = await import("./vision_bundle.mjs");
  }
  return visionModule;
}

let landmarker = null;
let initialization = null;

async function createLandmarker(delegate) {
  const { FaceLandmarker, FilesetResolver } = await loadVisionModule();
  const vision = await FilesetResolver.forVisionTasks("/legacy");
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/legacy/face_landmarker.task",
      delegate: delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
    outputFaceBlendshapes: true,
  });
}

async function ensureLandmarker() {
  if (landmarker) return landmarker;
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      return await createLandmarker("GPU");
    } catch (gpuError) {
      console.warn("Emotion worker GPU delegate unavailable, using CPU.", gpuError);
      return createLandmarker("CPU");
    }
  })();
  try {
    landmarker = await initialization;
    return landmarker;
  } finally {
    initialization = null;
  }
}

function serializeCategories(result) {
  const categories =
    result &&
    result.faceBlendshapes &&
    result.faceBlendshapes[0] &&
    result.faceBlendshapes[0].categories
      ? result.faceBlendshapes[0].categories
      : [];
  return categories.map((item) => ({
    categoryName: String(item.categoryName || ""),
    score: Number(item.score) || 0,
  }));
}

self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type === "init") {
    try {
      await ensureLandmarker();
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({
        type: "error",
        stage: "init",
        message: error && error.message ? error.message : String(error),
      });
    }
    return;
  }

  if (data.type !== "frame" || !data.bitmap) return;
  const bitmap = data.bitmap;
  try {
    const model = await ensureLandmarker();
    const result = model.detectForVideo(bitmap, Number(data.timestamp) || performance.now());
    self.postMessage({
      type: "result",
      categories: serializeCategories(result),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      stage: "inference",
      message: error && error.message ? error.message : String(error),
    });
  } finally {
    bitmap.close();
  }
});
