const EMOTION_LABELS = {
  neutral: "平静",
  happy: "喜悦",
  angry: "愤怒",
  sad: "悲伤",
  surprised: "惊讶",
  disgusted: "厌恶",
  fearful: "恐惧",
};

const INFERENCE_INTERVAL_MS = 180;
const STABLE_SAMPLE_COUNT = 3;
const SWITCH_COOLDOWN_MS = 2400;
const MIN_EXPRESSION_SCORE = 0.31;

class EmotionMaskModule {
  constructor() {
    this.enabled = false;
    this.worker = null;
    this.workerReady = false;
    this.frameInFlight = false;
    this.workerInitResolve = null;
    this.workerInitReject = null;
    this.initializing = null;
    this.lastInferenceAt = 0;
    this.lastVideoTime = -1;
    this.lastStableEmotion = "";
    this.pendingEmotion = "";
    this.pendingCount = 0;
    this.lastSwitchAt = 0;
    this.mappingCache = new Map();
    this.animationFrame = 0;
    this.ui = this.mountUi();
    this.bindUi();
    this.render({
      phase: "idle",
      emotion: "neutral",
      confidence: 0,
      faceTitle: "等待开启",
      reason: "开启后，模型在本机识别表情，RAG 决定对应脸谱。",
    });
  }

  mountUi() {
    const controls = document.querySelector(".controls");
    if (!controls) throw new Error("Emotion module requires .controls");

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "emotion-mask-entry";
    openButton.setAttribute("aria-expanded", "false");
    openButton.textContent = "情绪切换脸谱";
    controls.appendChild(openButton);

    const panel = document.createElement("section");
    panel.className = "emotion-mask-panel";
    panel.setAttribute("aria-label", "情绪切换脸谱");
    panel.innerHTML =
      '<div class="emotion-mask-head">' +
        '<div>' +
          '<span class="emotion-mask-kicker">独立功能模块</span>' +
          '<h2>情绪切换脸谱</h2>' +
        '</div>' +
        '<label class="emotion-mask-toggle">' +
          '<input type="checkbox" aria-label="开启情绪切换脸谱">' +
          '<span aria-hidden="true"></span>' +
          '<b>自动切换</b>' +
        '</label>' +
      '</div>' +
      '<div class="emotion-mask-live" aria-live="polite">' +
        '<div class="emotion-mask-primary">' +
          '<span class="emotion-mask-state"><i></i><em>未开启</em></span>' +
          '<strong class="emotion-mask-emotion">平静</strong>' +
          '<span class="emotion-mask-confidence">置信度 0%</span>' +
        '</div>' +
        '<div class="emotion-mask-route" aria-label="RAG 匹配结果">' +
          '<span>RAG 匹配脸谱</span>' +
          '<strong class="emotion-mask-face">等待开启</strong>' +
          '<p class="emotion-mask-reason">开启后，模型在本机识别表情，RAG 决定对应脸谱。</p>' +
          '<a class="emotion-mask-source" target="_blank" rel="noopener" hidden>查看知识来源</a>' +
        '</div>' +
      '</div>' +
      '<p class="emotion-mask-privacy">Google MediaPipe 预训练 Blendshape 模型仅在本机处理画面。后端只接收情绪标签与置信度，用于 RAG 文化映射。本功能不是心理诊断。</p>';

    controls.insertAdjacentElement("afterend", panel);
    this.installStyles();

    return {
      openButton: openButton,
      panel: panel,
      toggle: panel.querySelector('input[type="checkbox"]'),
      state: panel.querySelector(".emotion-mask-state em"),
      stateDot: panel.querySelector(".emotion-mask-state i"),
      emotion: panel.querySelector(".emotion-mask-emotion"),
      confidence: panel.querySelector(".emotion-mask-confidence"),
      face: panel.querySelector(".emotion-mask-face"),
      reason: panel.querySelector(".emotion-mask-reason"),
      source: panel.querySelector(".emotion-mask-source"),
    };
  }

  installStyles() {
    if (document.getElementById("emotionMaskStyles")) return;
    const style = document.createElement("style");
    style.id = "emotionMaskStyles";
    style.textContent =
      ".emotion-mask-entry{background:rgba(7,18,29,.76)!important;color:#b8f5ff!important;border-color:rgba(127,229,255,.34)!important}" +
      ".emotion-mask-panel{display:none;width:min(100%,860px);margin:12px auto 28px;padding:22px;border:1px solid rgba(127,229,255,.2);border-radius:20px;background:linear-gradient(135deg,rgba(6,13,22,.94),rgba(54,13,21,.86));box-shadow:0 24px 72px rgba(0,0,0,.38);color:#f6f3e8;text-align:left}" +
      ".emotion-mask-panel.is-visible{display:block}" +
      ".emotion-mask-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:17px;border-bottom:1px solid rgba(127,229,255,.14)}" +
      ".emotion-mask-kicker{display:block;margin-bottom:6px;color:#7fe5ff;font-size:.78rem;letter-spacing:.18em}" +
      ".emotion-mask-head h2{margin:0;font-family:'STKaiti','KaiTi',serif;font-size:1.65rem;letter-spacing:.12em}" +
      ".emotion-mask-toggle{display:inline-flex;align-items:center;gap:9px;min-height:44px;cursor:pointer;color:#ffe6ad}" +
      ".emotion-mask-toggle input{position:absolute;opacity:0;pointer-events:none}" +
      ".emotion-mask-toggle span{position:relative;width:48px;height:27px;border:1px solid rgba(127,229,255,.25);border-radius:999px;background:rgba(255,255,255,.08);transition:background-color 180ms ease,border-color 180ms ease}" +
      ".emotion-mask-toggle span:after{content:'';position:absolute;left:3px;top:3px;width:19px;height:19px;border-radius:50%;background:#f6f3e8;transition:transform 180ms cubic-bezier(.16,1,.3,1)}" +
      ".emotion-mask-toggle input:checked+span{border-color:rgba(127,229,255,.6);background:rgba(27,155,188,.46)}" +
      ".emotion-mask-toggle input:checked+span:after{transform:translateX(21px);background:#b8f5ff}" +
      ".emotion-mask-toggle input:focus-visible+span{outline:2px solid rgba(127,229,255,.84);outline-offset:4px}" +
      ".emotion-mask-live{display:grid;grid-template-columns:minmax(170px,.38fr) minmax(0,1fr);gap:22px;padding-top:18px}" +
      ".emotion-mask-primary{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:8px;padding-right:20px;border-right:1px solid rgba(255,230,173,.14)}" +
      ".emotion-mask-state{display:inline-flex;align-items:center;gap:8px;color:rgba(246,243,232,.72);font-size:.88rem}" +
      ".emotion-mask-state i{width:8px;height:8px;border-radius:50%;background:#6d737c;box-shadow:0 0 0 4px rgba(109,115,124,.12)}" +
      ".emotion-mask-state.is-live i{background:#7fe5ff;box-shadow:0 0 0 4px rgba(127,229,255,.13),0 0 14px rgba(127,229,255,.5)}" +
      ".emotion-mask-state.is-error i{background:#ff7b7b;box-shadow:0 0 0 4px rgba(255,123,123,.12)}" +
      ".emotion-mask-state em{font-style:normal}" +
      ".emotion-mask-emotion{font-family:'STKaiti','KaiTi',serif;font-size:2.2rem;letter-spacing:.1em;color:#fff1cb}" +
      ".emotion-mask-confidence{color:#b8f5ff;font-family:'Cascadia Mono','Consolas',monospace;font-size:.86rem}" +
      ".emotion-mask-route{min-width:0}" +
      ".emotion-mask-route>span{color:rgba(246,243,232,.64);font-size:.86rem;letter-spacing:.1em}" +
      ".emotion-mask-face{display:block;margin:7px 0 8px;color:#ffe6ad;font-family:'STKaiti','KaiTi',serif;font-size:1.42rem;letter-spacing:.08em}" +
      ".emotion-mask-reason{margin:0;color:rgba(246,243,232,.78);font-size:1rem;line-height:1.7}" +
      ".emotion-mask-source{display:inline-block;margin-top:9px;color:#7fe5ff;text-underline-offset:4px}" +
      ".emotion-mask-source[hidden]{display:none}" +
      ".emotion-mask-privacy{margin:17px 0 0;padding-top:14px;border-top:1px solid rgba(127,229,255,.1);color:rgba(246,243,232,.56);font-size:.84rem;line-height:1.65}" +
      "@media(max-width:700px){.emotion-mask-panel{padding:18px}.emotion-mask-head{align-items:flex-start;flex-direction:column}.emotion-mask-live{grid-template-columns:1fr}.emotion-mask-primary{padding:0 0 16px;border-right:0;border-bottom:1px solid rgba(255,230,173,.14)}}" +
      "@media(prefers-reduced-motion:reduce){.emotion-mask-toggle span,.emotion-mask-toggle span:after{transition:none}}";
    document.head.appendChild(style);
  }

  bindUi() {
    this.ui.openButton.addEventListener("click", () => {
      const visible = this.ui.panel.classList.toggle("is-visible");
      this.ui.openButton.setAttribute("aria-expanded", String(visible));
    });
    this.ui.toggle.addEventListener("change", () => {
      if (this.ui.toggle.checked) {
        void this.enable();
      } else {
        this.disable();
      }
    });
  }

  handleWorkerMessage(event) {
    const data = event.data || {};
    if (data.type === "ready") {
      this.workerReady = true;
      if (this.workerInitResolve) this.workerInitResolve(true);
      this.workerInitResolve = null;
      this.workerInitReject = null;
      return;
    }
    if (data.type === "result") {
      this.frameInFlight = false;
      if (this.enabled) this.handleCategories(data.categories || []);
      return;
    }
    if (data.type === "error") {
      this.frameInFlight = false;
      const error = new Error(data.message || "Emotion worker failed");
      if (this.workerInitReject) {
        this.workerInitReject(error);
        this.workerInitResolve = null;
        this.workerInitReject = null;
      } else {
        console.warn("Emotion worker inference skipped.", error);
      }
    }
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(
      "/legacy/emotion_mask_worker.js?v=20260713-classic-worker"
    );
    this.worker.addEventListener("message", (event) => this.handleWorkerMessage(event));
    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Emotion worker could not start");
      if (this.workerInitReject) this.workerInitReject(error);
      this.workerInitResolve = null;
      this.workerInitReject = null;
      this.initializing = null;
      this.frameInFlight = false;
    });
    return this.worker;
  }

  async ensureModel() {
    if (this.workerReady) return true;
    if (this.initializing) return this.initializing;
    const worker = this.ensureWorker();
    this.initializing = new Promise((resolve, reject) => {
      this.workerInitResolve = resolve;
      this.workerInitReject = reject;
      worker.postMessage({ type: "init" });
    });
    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  async enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.ui.panel.classList.add("is-visible");
    this.ui.openButton.setAttribute("aria-expanded", "true");
    this.render({
      phase: "loading",
      emotion: "neutral",
      confidence: 0,
      faceTitle: "模型载入中",
      reason: "正在载入本地 MediaPipe 预训练模型。",
    });
    try {
      await this.ensureModel();
      if (!this.enabled) return;
      this.render({
        phase: "waiting",
        emotion: "neutral",
        confidence: 0,
        faceTitle: "等待摄像头",
        reason: "启动摄像头并正对画面，系统会在表情稳定后查询 RAG。",
      });
      this.loop();
    } catch (error) {
      console.error("Emotion mask model failed to initialize.", error);
      this.enabled = false;
      this.ui.toggle.checked = false;
      this.render({
        phase: "error",
        emotion: "neutral",
        confidence: 0,
        faceTitle: "模型不可用",
        reason: "本地表情模型载入失败，请刷新页面后重试。",
      });
    }
  }

  disable() {
    this.enabled = false;
    cancelAnimationFrame(this.animationFrame);
    this.pendingEmotion = "";
    this.pendingCount = 0;
    this.lastStableEmotion = "";
    this.render({
      phase: "idle",
      emotion: "neutral",
      confidence: 0,
      faceTitle: "已暂停",
      reason: "情绪识别和自动脸谱切换已停止。",
    });
  }

  loop() {
    cancelAnimationFrame(this.animationFrame);
    const tick = async (timestamp) => {
      if (!this.enabled) return;
      const video = document.getElementById("video");
      const ready = video && video.readyState >= 2 && video.videoWidth > 0 && !video.paused;
      if (!ready) {
        this.renderPhaseOnly("waiting", "等待摄像头");
      } else if (
        timestamp - this.lastInferenceAt >= INFERENCE_INTERVAL_MS &&
        video.currentTime !== this.lastVideoTime &&
        !this.frameInFlight
      ) {
        this.lastInferenceAt = timestamp;
        this.lastVideoTime = video.currentTime;
        this.frameInFlight = true;
        try {
          const bitmap = await createImageBitmap(video);
          if (!this.enabled) {
            bitmap.close();
            this.frameInFlight = false;
          } else {
            this.worker.postMessage(
              { type: "frame", bitmap: bitmap, timestamp: performance.now() },
              [bitmap]
            );
          }
        } catch (error) {
          this.frameInFlight = false;
          console.warn("Emotion inference frame skipped.", error);
        }
      }
      this.animationFrame = requestAnimationFrame(tick);
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  handleCategories(categories) {
    if (!categories || !categories.length) {
      this.renderPhaseOnly("waiting", "未检测到人脸");
      return;
    }

    const prediction = this.classify(categories);
    this.render({
      phase: "live",
      emotion: prediction.emotion,
      confidence: prediction.confidence,
    });

    if (prediction.emotion === this.pendingEmotion) {
      this.pendingCount += 1;
    } else {
      this.pendingEmotion = prediction.emotion;
      this.pendingCount = 1;
    }
    if (this.pendingCount < STABLE_SAMPLE_COUNT) return;
    if (prediction.emotion === this.lastStableEmotion) return;

    this.lastStableEmotion = prediction.emotion;
    void this.resolveAndSwitch(prediction);
  }

  classify(categories) {
    const values = new Map(
      categories.map((item) => [item.categoryName, Number(item.score) || 0])
    );
    const get = (name) => values.get(name) || 0;
    const mean = (a, b) => (get(a) + get(b)) / 2;
    const scores = {
      happy:
        mean("mouthSmileLeft", "mouthSmileRight") * 0.66 +
        mean("cheekSquintLeft", "cheekSquintRight") * 0.24 +
        get("mouthDimpleLeft") * 0.05 +
        get("mouthDimpleRight") * 0.05,
      angry:
        mean("browDownLeft", "browDownRight") * 0.4 +
        mean("eyeSquintLeft", "eyeSquintRight") * 0.22 +
        mean("noseSneerLeft", "noseSneerRight") * 0.18 +
        mean("mouthFrownLeft", "mouthFrownRight") * 0.2,
      sad:
        mean("mouthFrownLeft", "mouthFrownRight") * 0.44 +
        get("browInnerUp") * 0.34 +
        get("mouthShrugLower") * 0.12 +
        mean("eyeLookDownLeft", "eyeLookDownRight") * 0.1,
      surprised:
        get("jawOpen") * 0.36 +
        mean("eyeWideLeft", "eyeWideRight") * 0.32 +
        get("browInnerUp") * 0.2 +
        mean("browOuterUpLeft", "browOuterUpRight") * 0.12,
      disgusted:
        mean("noseSneerLeft", "noseSneerRight") * 0.48 +
        mean("mouthUpperUpLeft", "mouthUpperUpRight") * 0.31 +
        get("mouthShrugUpper") * 0.21,
      fearful:
        mean("eyeWideLeft", "eyeWideRight") * 0.31 +
        get("browInnerUp") * 0.24 +
        mean("mouthStretchLeft", "mouthStretchRight") * 0.27 +
        get("jawOpen") * 0.18,
    };

    const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const best = ordered[0];
    const second = ordered[1];
    const separation = Math.max(0, best[1] - second[1]);
    if (best[1] < MIN_EXPRESSION_SCORE || separation < 0.035) {
      const neutralConfidence = Math.max(0.38, Math.min(0.96, 1 - best[1]));
      return { emotion: "neutral", confidence: neutralConfidence, rawScore: best[1] };
    }
    return {
      emotion: best[0],
      confidence: Math.min(0.99, 0.42 + best[1] * 0.48 + separation * 0.25),
      rawScore: best[1],
    };
  }

  getBackendBaseUrl() {
    if (window.AI_OPERA_BACKEND_BASE_URL) {
      return String(window.AI_OPERA_BACKEND_BASE_URL).replace(/\/$/, "");
    }
    const host = window.location.hostname || "127.0.0.1";
    return window.location.port === "8000"
      ? window.location.origin
      : window.location.protocol + "//" + host + ":8000";
  }

  getCurrentFaceKey() {
    const renderer = window.personalizedRenderer;
    const list = renderer && renderer.faceTextureList ? renderer.faceTextureList : [];
    const raw = list[renderer && renderer.currentTextureIndex ? renderer.currentTextureIndex : 0] || "";
    if (window.resolveFaceKnowledgeKey) {
      return window.resolveFaceKnowledgeKey(String(raw).replace(/\.(png|jpg|jpeg|webp)$/i, ""));
    }
    return String(raw).replace(/\.(png|jpg|jpeg|webp)$/i, "");
  }

  async fetchMapping(prediction) {
    if (this.mappingCache.has(prediction.emotion)) {
      return this.mappingCache.get(prediction.emotion);
    }
    const response = await fetch(this.getBackendBaseUrl() + "/api/ai/emotion-face-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emotion: prediction.emotion,
        confidence: prediction.confidence,
        currentFaceKey: this.getCurrentFaceKey(),
      }),
    });
    if (!response.ok) throw new Error("RAG mapping HTTP " + response.status);
    const mapping = await response.json();
    this.mappingCache.set(prediction.emotion, mapping);
    return mapping;
  }

  async resolveAndSwitch(prediction) {
    this.renderPhaseOnly("mapping", "RAG 匹配中");
    try {
      const mapping = await this.fetchMapping(prediction);
      this.render({
        phase: "live",
        emotion: prediction.emotion,
        confidence: prediction.confidence,
        faceTitle: mapping.face && mapping.face.title ? mapping.face.title : mapping.textureFile,
        reason: mapping.reason,
        source: mapping.evidence,
      });

      const now = performance.now();
      if (now - this.lastSwitchAt < SWITCH_COOLDOWN_MS) return;
      const renderer = window.personalizedRenderer;
      if (!renderer || typeof renderer.switchTexture !== "function") return;

      const switched = await renderer.switchTexture(mapping.textureFile);
      if (!switched) return;
      this.lastSwitchAt = now;
      if (typeof window.__recordExperiencedMask === "function") {
        window.__recordExperiencedMask({
          textureKey: mapping.textureFile,
          source: "stage-rag-emotion-switch",
          emotion: prediction.emotion,
          confidence: prediction.confidence,
          ragDocumentId: mapping.evidence && mapping.evidence.documentId,
          timestamp: Date.now(),
        });
      }
      if (typeof window.addLog === "function") {
        window.addLog(
          "🎭 情绪切换：" + EMOTION_LABELS[prediction.emotion] + " → " +
          (mapping.face && mapping.face.title ? mapping.face.title : mapping.textureFile) +
          "（RAG）",
          "trigger"
        );
      }
      window.dispatchEvent(new CustomEvent("ai-opera:emotion-mask-switched", {
        detail: {
          emotion: prediction.emotion,
          confidence: prediction.confidence,
          mapping: mapping,
        },
      }));
    } catch (error) {
      console.warn("RAG emotion mapping unavailable.", error);
      this.render({
        phase: "error",
        emotion: prediction.emotion,
        confidence: prediction.confidence,
        faceTitle: "RAG 暂不可用",
        reason: "为避免使用硬编码映射，本次不自动切脸。请确认 FastAPI 后端已启动。",
      });
    }
  }

  renderPhaseOnly(phase, stateText) {
    this.ui.state.textContent = stateText;
    this.ui.stateDot.parentElement.classList.toggle("is-live", phase === "live" || phase === "mapping");
    this.ui.stateDot.parentElement.classList.toggle("is-error", phase === "error");
  }

  render(next) {
    const emotion = next.emotion || "neutral";
    this.ui.state.textContent = {
      idle: "未开启",
      loading: "模型载入中",
      waiting: "等待摄像头",
      live: "实时识别中",
      mapping: "RAG 匹配中",
      error: "需要处理",
    }[next.phase] || "实时识别中";
    this.ui.stateDot.parentElement.classList.toggle(
      "is-live",
      next.phase === "live" || next.phase === "mapping"
    );
    this.ui.stateDot.parentElement.classList.toggle("is-error", next.phase === "error");
    this.ui.emotion.textContent = EMOTION_LABELS[emotion] || emotion;
    this.ui.confidence.textContent =
      "置信度 " + Math.round((Number(next.confidence) || 0) * 100) + "%";
    if (next.faceTitle) this.ui.face.textContent = next.faceTitle;
    if (next.reason) this.ui.reason.textContent = next.reason;

    const source = next.source || null;
    if (source && source.sourceUrl) {
      this.ui.source.hidden = false;
      this.ui.source.href = source.sourceUrl;
      this.ui.source.textContent = "查看依据：" + (source.source || source.title || "知识来源");
    } else if (source) {
      this.ui.source.hidden = false;
      this.ui.source.removeAttribute("href");
      this.ui.source.textContent = "依据：" + (source.source || source.title || "项目知识库");
    } else {
      this.ui.source.hidden = true;
      this.ui.source.removeAttribute("href");
    }
  }
}

try {
  window.AIOperaEmotionMaskModule = new EmotionMaskModule();
} catch (error) {
  console.error("Emotion mask module failed to mount.", error);
}
