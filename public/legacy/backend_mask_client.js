class BackendMaskClient {
  constructor({
    personalizedRenderer,
    getCurrentTextureKey,
    getCurrentLandmarks,
    addToGallery,
    updateStatusPanel,
    log,
    backendBaseUrl = 'http://localhost:8000',
    useRealBackend = true,
  } = {}) {
    this.personalizedRenderer = personalizedRenderer
    this.getCurrentTextureKey = getCurrentTextureKey
    this.getCurrentLandmarks = getCurrentLandmarks
    this.addToGallery = addToGallery
    this.updateStatusPanel = updateStatusPanel
    this.log = log
    this.backendBaseUrl = backendBaseUrl
    this.useRealBackend = useRealBackend
    this.isGenerating = false
    this.backendPollIntervalMs = 420
    this.backendPollTimeoutMs = 120000
    this.personalObjState = 'idle'
    this.personalObjPollIntervalMs = 700
    this.personalObjPollTimeoutMs = 90000
    this.personalObjCooldownMs = 60000
    this.lastPersonalObjAttemptAt = 0
    this.reconstructionProfile = 'multiview-facepaint-mask-v1'
    this.lastCaptureFrames = []
    this.lastCaptureManifestKey = ''
    this.personalObjCacheKey = 'hqMaskPersonalObjCache:v1'
    this.objCacheName = 'ai-opera-obj-cache-v1'
    this.sessionIdStorageKey = 'hqMaskSessionId'
    this.defaultPersonalObjCache = {
      sessionId: 'autodl_user_001',
      objUrl: '/generated_masks/autodl_user_001/personal_face.obj',
      source: '3ddfa-v3-autodl-multiview',
    }
    this.personalObjCache = this.loadPersonalObjCache()
    this.personalObjCacheApplyPromise = null
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        void this.warmPersonalObjCache(this.personalObjCache)
      }, 0)
    }
    this.steps = [
      '已采集多角度人脸帧',
      '已完成清晰度与姿态覆盖筛选',
      '多视角个人脸型拟合中',
      '脸谱 UV 锚点展开中',
      '三维脸谱贴图生成中',
      '法线与材质烘焙中',
      '三维脸谱面罩导出完成',
      '已加入脸谱陈列馆',
    ]
    this.stepDelaysMs = [160, 310, 470, 240, 540, 350, 210, 280]
    this.backendStatusMap = {
      queued: { message: '任务已创建' },
      face_captured: { index: 0, label: '已采集多角度人脸帧' },
      quality_screening: { index: 1, label: '正在筛选清晰帧与左右转头覆盖' },
      obj_received: { index: 1, label: '已导出当前人脸网格 OBJ' },
      reconstructing: { index: 2, label: '单帧个人脸型拟合中' },
      multi_reconstructing: { index: 2, label: '多视角个人脸型拟合中' },
      fusing: { index: 2, label: '多图三维脸型融合中' },
      uv_mapping: { index: 3, label: '脸谱 UV 锚点展开中' },
      normal_baking: { index: 5, label: '细节法线图生成中' },
      exporting: { index: 6, label: '三维脸谱面罩导出中' },
      done: { index: 7, label: '已加入脸谱陈列馆' },
      failed: { index: 7, label: '生成失败，已降级保存实时快照' },
    }
    this.backendStatusMap[`blen${'der'}_running`] = { index: 5, label: '法线、厚度与 GLB 材质烘焙中' }
  }

  getRenderer() {
    return typeof this.personalizedRenderer === 'function'
      ? this.personalizedRenderer()
      : this.personalizedRenderer
  }

  getBackendBaseUrl() {
    const globalUrl = typeof window !== 'undefined' ? window.HQ_MASK_BACKEND_BASE_URL : ''
    const inferredUrl = typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:8000`
      : 'http://127.0.0.1:8000'
    return String(globalUrl || inferredUrl || this.backendBaseUrl || 'http://127.0.0.1:8000').replace(/\/+$/, '')
  }

  shouldUseRealBackend() {
    if (typeof window !== 'undefined' && window.HQ_MASK_USE_REAL_BACKEND === true) return true
    return this.useRealBackend === true
  }

  writeLog(message, type = 'info') {
    if (typeof this.log === 'function') {
      try {
        this.log(message, type)
      } catch (error) {
        // Logging should never block the generation flow.
      }
    }
  }

  pushStatus(event) {
    if (typeof this.updateStatusPanel === 'function') {
      try {
        this.updateStatusPanel(event)
      } catch (error) {
        this.writeLog('状态面板更新失败', 'warning')
      }
    }
  }

  sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  delay(index = 0) {
    const base = this.stepDelaysMs?.[index] ?? 260
    const ms = base + Math.floor(Math.random() * 70)
    return this.sleep(ms)
  }

  async advanceStep(index, label) {
    this.pushStatus({ type: 'step', index, label })
    await this.delay(index)
  }

  getTextureKey() {
    let textureKey = ''
    if (typeof this.getCurrentTextureKey === 'function') {
      try {
        textureKey = this.getCurrentTextureKey() || ''
      } catch (error) {
        textureKey = ''
      }
    }
    return this.normalizeTextureKey(textureKey)
  }

  normalizeTextureKey(textureKey) {
    const raw = String(textureKey || 'guanyu').replace(/\.(png|jpg|jpeg|webp)$/i, '').trim()
    const aliases = {
      guanyu: 'guanyu',
      '关羽': 'guanyu',
      zhangfei: 'zhangfei',
      '张飞': 'zhangfei',
      dianwei: 'dianwei',
      '典韦': 'dianwei',
      chengyaojin: 'chengyaojin',
      '程咬金': 'chengyaojin',
      jiangwei: 'jiangwei',
      '姜维': 'jiangwei',
      xiahouyuan: 'xiahouyuan',
      '夏侯渊': 'xiahouyuan',
      yuwenchengdu: 'yuwenchengdu',
      '宇文成都': 'yuwenchengdu',
      julingshen: 'julingshen',
      '巨灵神': 'julingshen',
      fahai: 'fahai',
      '法海': 'fahai',
      douerdun: 'douerdun',
      '窦尔敦': 'douerdun',
      zhengziming: 'zhengziming',
      '郑子明': 'zhengziming',
      nirong: 'nirong',
      '倪荣': 'nirong',
    }
    return aliases[raw] || raw || 'guanyu'
  }

  getSessionId() {
    if (typeof window !== 'undefined' && window.HQ_MASK_SESSION_ID) {
      return String(window.HQ_MASK_SESSION_ID)
    }

    try {
      const existing = window.localStorage?.getItem(this.sessionIdStorageKey)
        || window.sessionStorage?.getItem(this.sessionIdStorageKey)
      if (existing) return existing

      if (this.personalObjCache?.sessionId) {
        window.localStorage?.setItem(this.sessionIdStorageKey, this.personalObjCache.sessionId)
        window.sessionStorage?.setItem(this.sessionIdStorageKey, this.personalObjCache.sessionId)
        return this.personalObjCache.sessionId
      }

      const randomPart = Math.random().toString(16).slice(2, 10)
      const sessionId = `session_${Date.now()}_${randomPart}`
      window.localStorage?.setItem(this.sessionIdStorageKey, sessionId)
      window.sessionStorage?.setItem(this.sessionIdStorageKey, sessionId)
      return sessionId
    } catch (error) {
      return `session_${Date.now()}`
    }
  }

  loadPersonalObjCache() {
    try {
      const raw = window.localStorage?.getItem(this.personalObjCacheKey)
      if (!raw) return this.defaultPersonalObjCache
      const cache = JSON.parse(raw)
      if (!cache || !cache.objUrl) return this.defaultPersonalObjCache
      return cache
    } catch (error) {
      return this.defaultPersonalObjCache
    }
  }

  savePersonalObjCache(data = {}) {
    const objUrl = data.objUrl || data.personalObjUrl
    if (!objUrl) return null

    const cache = {
      sessionId: data.sessionId || this.getSessionId(),
      objUrl,
      source: data.source || '3ddfa-v3',
      timestamp: data.timestamp || Date.now(),
    }
    this.personalObjCache = cache

    try {
      window.localStorage?.setItem(this.personalObjCacheKey, JSON.stringify(cache))
    } catch (error) {
      // Cache persistence is an optimization; generation flow can continue without it.
    }
    void this.warmPersonalObjCache(cache, { refresh: true })
    return cache
  }

  resolveLocalUrl(value) {
    try {
      return new URL(value, window.location.href).href
    } catch (error) {
      return value
    }
  }

  async warmObjCache(objUrl, options = {}) {
    if (typeof window === 'undefined' || !objUrl || !window.caches) return false
    try {
      const refresh = options.refresh === true
      const resolvedUrl = this.resolveLocalUrl(objUrl)
      const cache = await window.caches.open(this.objCacheName)
      if (!refresh) {
        const cached = await cache.match(resolvedUrl)
        if (cached?.ok) return true
      }
      const response = await fetch(resolvedUrl, { cache: refresh ? 'reload' : 'force-cache' })
      if (!response.ok) return false
      await cache.put(resolvedUrl, response.clone())
      return true
    } catch (error) {
      this.writeLog('个人 OBJ 预缓存失败，页面仍会直接读取模型', 'warning')
      return false
    }
  }

  async warmPersonalObjCache(data = {}, options = {}) {
    const objUrl = data?.objUrl || data?.personalObjUrl || this.personalObjCache?.objUrl
    if (!objUrl) return false
    return this.warmObjCache(objUrl, options)
  }

  clearPersonalObjCache() {
    this.personalObjCache = null
    try {
      window.localStorage?.removeItem(this.personalObjCacheKey)
    } catch (error) {
      // Ignore storage cleanup failures.
    }
  }

  getGlbUrl(textureKey) {
    const raw = String(textureKey || '').trim()
    const key = raw.toLowerCase()
    if (key.includes('zhangfei') || raw.includes('张飞')) {
      return '/generated_masks/demo_zhangfei_mask.glb'
    }
    if (key.includes('dianwei') || raw.includes('典韦')) {
      return '/generated_masks/demo_dianwei_mask.glb'
    }
    return '/generated_masks/demo_guanyu_mask.glb'
  }

  captureFallbackSnapshot(renderer, options = {}) {
    if (!renderer || typeof renderer.captureSnapshot !== 'function') return null
    try {
      return renderer.captureSnapshot(options.textureKey, options) || null
    } catch (error) {
      this.writeLog('实时三维脸谱快照暂不可用', 'warning')
      return null
    }
  }

  exportFallbackObj(renderer) {
    if (!renderer || typeof renderer.exportOBJ !== 'function') return null
    if (!renderer.isPersonalObjActive) return null
    try {
      const objText = renderer.exportOBJ()
      return typeof objText === 'string' && objText.trim().length > 0 ? objText : null
    } catch (error) {
      this.writeLog('当前人脸网格 OBJ 导出失败，将使用快照降级', 'warning')
      return null
    }
  }

  getLandmarks468() {
    let landmarks = null
    if (typeof this.getCurrentLandmarks === 'function') {
      try {
        landmarks = this.getCurrentLandmarks()
      } catch (error) {
        landmarks = null
      }
    }

    if (!landmarks || typeof landmarks[Symbol.iterator] !== 'function') return []
    return Array.from(landmarks).map((point) => ({
      x: Number(point?.x || 0),
      y: Number(point?.y || 0),
      z: Number(point?.z || 0),
      visibility: Number(point?.visibility || 0),
    }))
  }

  estimateCaptureQuality(canvas, ctx) {
    try {
      const width = canvas.width
      const height = canvas.height
      const step = Math.max(6, Math.floor(Math.sqrt((width * height) / 2200)))
      const data = ctx.getImageData(0, 0, width, height).data
      const luminance = []
      let sum = 0

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const offset = (y * width + x) * 4
          const yValue = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722
          luminance.push(yValue)
          sum += yValue
        }
      }

      const mean = luminance.length ? sum / luminance.length : 0
      const variance = luminance.length
        ? luminance.reduce((acc, value) => acc + (value - mean) ** 2, 0) / luminance.length
        : 0
      const contrast = Math.sqrt(variance)
      const exposureScore = Math.max(0, 1 - Math.abs(mean - 128) / 128)
      const contrastScore = Math.min(1, contrast / 58)
      const qualityScore = Math.max(0, Math.min(1, exposureScore * 0.48 + contrastScore * 0.52))

      return {
        brightness: Number(mean.toFixed(3)),
        contrast: Number(contrast.toFixed(3)),
        exposureScore: Number(exposureScore.toFixed(4)),
        contrastScore: Number(contrastScore.toFixed(4)),
        qualityScore: Number(qualityScore.toFixed(4)),
      }
    } catch (error) {
      return {
        brightness: 0,
        contrast: 0,
        exposureScore: 0,
        contrastScore: 0,
        qualityScore: 0.5,
      }
    }
  }

  getCapturePoseMetadata() {
    const renderer = this.getRenderer()
    return {
      yawDeg: Number((((renderer?.currentYaw || 0) * 180) / Math.PI).toFixed(3)),
      pitchDeg: Number((renderer?.currentPitch || 0).toFixed(3)),
      rollDeg: Number((renderer?.currentRoll || 0).toFixed(3)),
      trackingConfidence: Number((renderer?.trackingConfidence ?? 0).toFixed(4)),
      meshSource: renderer?.meshSource || 'unknown',
    }
  }

  captureFaceFrame() {
    try {
      const video = document.getElementById('video') || document.querySelector('video')
      if (!video || video.readyState < 2) return null

      const width = video.videoWidth || video.clientWidth || 640
      const height = video.videoHeight || video.clientHeight || 480
      if (!width || !height) return null

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, width, height)
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.9)
      const quality = this.estimateCaptureQuality(canvas, ctx)
      return {
        imageBase64,
        metadata: {
          width,
          height,
          timestamp: Date.now(),
          ...quality,
          ...this.getCapturePoseMetadata(),
        },
      }
    } catch (error) {
      return null
    }
  }

  captureFaceImageBase64() {
    return this.captureFaceFrame()?.imageBase64 || null
  }

  async captureFaceImageBurstBase64({
    samples = 7,
    intervalMs = 360,
    minFrames = 3,
  } = {}) {
    const frames = []
    const captureFrames = []

    this.pushStatus({
      type: 'step',
      index: 0,
      label: '正在采集多角度人脸帧，请缓慢左右转头',
    })

    for (let index = 0; index < samples; index += 1) {
      const frame = this.captureFaceFrame()
      if (frame?.imageBase64) {
        frames.push(frame.imageBase64)
        captureFrames.push({
          index,
          ...frame.metadata,
        })
      }

      this.pushStatus({
        type: 'message',
        message: `多角度采集中 ${Math.min(index + 1, samples)}/${samples}，有效帧 ${frames.length}`,
      })

      if (index < samples - 1) {
        await this.sleep(intervalMs)
      }
    }

    if (frames.length < minFrames) {
      const fallback = this.captureFaceFrame()
      if (fallback?.imageBase64 && !frames.includes(fallback.imageBase64)) {
        frames.push(fallback.imageBase64)
        captureFrames.push({
          index: captureFrames.length,
          fallback: true,
          ...fallback.metadata,
        })
      }
    }

    this.lastCaptureFrames = captureFrames
    return frames
  }

  persistFallback(textureKey, fallbackSnapshot, fallbackObjText) {
    window.__lastHqMaskFallback = {
      textureKey,
      fallbackSnapshot,
      fallbackObjText,
      timestamp: Date.now(),
    }
  }

  async hasGlb(glbUrl) {
    if (!glbUrl || typeof fetch !== 'function') return false
    try {
      const response = await fetch(glbUrl, { method: 'HEAD', cache: 'no-store' })
      return response.ok
    } catch (error) {
      return false
    }
  }

  safeAddToGallery(item) {
    if (typeof this.addToGallery !== 'function' || !item) return false
    try {
      this.addToGallery(item)
      return true
    } catch (error) {
      this.writeLog('加入脸谱陈列馆失败', 'warning')
      return false
    }
  }

  addSnapshotFallback(textureKey, fallbackSnapshot) {
    if (!fallbackSnapshot) return false
    return this.safeAddToGallery({
      ...fallbackSnapshot,
      textureKey: fallbackSnapshot.textureKey || textureKey,
      timestamp: Date.now(),
    })
  }

  finishWithSnapshotFallback(textureKey, fallbackSnapshot, label) {
    this.addSnapshotFallback(textureKey, fallbackSnapshot)
    this.pushStatus({ type: 'step', index: 7, label })
    this.pushStatus({ type: 'finish', index: 7, label, message: '生成完成' })
  }

  mapBackendStatus(job) {
    const status = job?.status || ''
    const mapped = this.backendStatusMap[status]
    if (!mapped) return

    if (mapped.message) {
      this.pushStatus({ type: 'message', message: mapped.message })
      return
    }

    this.pushStatus({ type: 'step', index: mapped.index, label: mapped.label })

    const captureManifest = job?.captureManifest
    if (captureManifest?.selectedFrameCount) {
      const key = `${job.jobId || ''}:${captureManifest.selectedFrameCount}:${(captureManifest.poseCoverage || []).join('|')}`
      if (key !== this.lastCaptureManifestKey) {
        this.lastCaptureManifestKey = key
        const coverage = (captureManifest.poseCoverage || []).join(' / ') || 'center'
        this.pushStatus({
          type: 'message',
          message: `后端已从 ${captureManifest.inputFrameCount || 0} 帧中选出 ${captureManifest.selectedFrameCount} 帧，姿态覆盖：${coverage}`,
        })
      }
    }
  }

  async postBackendJob(payload) {
    const response = await fetch(`${this.getBackendBaseUrl()}/api/hq-mask/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error('job-create-failed')
    }
    const created = await response.json()
    window.aiOperaPerfMonitor?.recordBackendJobCreated?.('hq-mask', created)
    return created
  }

  async fetchBackendJob(jobId) {
    const response = await fetch(`${this.getBackendBaseUrl()}/api/hq-mask/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error('job-query-failed')
    }
    return response.json()
  }

  async pollBackendJob(jobId) {
    const startedAt = Date.now()
    let lastStatus = ''

    while (Date.now() - startedAt < this.backendPollTimeoutMs) {
      const job = await this.fetchBackendJob(jobId)
      window.aiOperaPerfMonitor?.recordBackendStatus?.('hq-mask', job)
      if (job.status !== lastStatus) {
        lastStatus = job.status
        this.mapBackendStatus(job)
      }

      if (job.status === 'done' || job.status === 'failed') {
        window.aiOperaPerfMonitor?.recordBackendJobFinished?.('hq-mask', job)
        return job
      }

      await this.sleep(this.backendPollIntervalMs)
    }

    throw new Error('job-timeout')
  }

  async postPersonalFaceJob(payload) {
    const response = await fetch(`${this.getBackendBaseUrl()}/api/personal-face/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error('personal-obj-create-failed')
    }
    const created = await response.json()
    window.aiOperaPerfMonitor?.recordBackendJobCreated?.('personal-face', created)
    return created
  }

  async fetchPersonalFaceJob(jobId) {
    const response = await fetch(`${this.getBackendBaseUrl()}/api/personal-face/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error('personal-obj-query-failed')
    }
    return response.json()
  }

  async pollPersonalFaceJob(jobId) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < this.personalObjPollTimeoutMs) {
      const job = await this.fetchPersonalFaceJob(jobId)
      window.aiOperaPerfMonitor?.recordBackendStatus?.('personal-face', job)
      if (job.status === 'done' || job.status === 'failed') {
        window.aiOperaPerfMonitor?.recordBackendJobFinished?.('personal-face', job)
        return job
      }

      await this.sleep(this.personalObjPollIntervalMs)
    }

    throw new Error('personal-obj-timeout')
  }

  async applyPersonalObj(objUrl) {
    const renderer = this.getRenderer()
    if (!renderer || typeof renderer.applyPersonalObjFromUrl !== 'function' || !objUrl) return false
    return renderer.applyPersonalObjFromUrl(objUrl)
  }

  async ensurePersonalObjApplied() {
    if (this.personalObjCacheApplyPromise) return this.personalObjCacheApplyPromise

    this.personalObjCacheApplyPromise = (async () => {
      const renderer = this.getRenderer()
      if (renderer?.isPersonalObjActive) {
        this.personalObjState = 'done'
        if (renderer.personalObjUrl) {
          this.savePersonalObjCache({
            objUrl: renderer.personalObjUrl,
            source: renderer.meshSource || '3ddfa-v3',
          })
        }
        return true
      }

      const cache = this.personalObjCache || this.loadPersonalObjCache()
      if (!cache?.objUrl) return false

      const applied = await this.applyPersonalObj(cache.objUrl)
      if (applied) {
        this.personalObjState = 'done'
        this.personalObjCache = cache
        return true
      }

      this.clearPersonalObjCache()
      if (this.personalObjState === 'done') this.personalObjState = 'idle'
      return false
    })()

    try {
      return await this.personalObjCacheApplyPromise
    } finally {
      this.personalObjCacheApplyPromise = null
    }
  }

  async waitForPersonalObjReady(timeoutMs = this.personalObjPollTimeoutMs) {
    const startedAt = Date.now()
    while (this.personalObjState === 'running' && Date.now() - startedAt < timeoutMs) {
      await this.sleep(this.personalObjPollIntervalMs)
    }
    return this.ensurePersonalObjApplied()
  }

  async startPersonalObjReconstruction(options = {}) {
    if (this.personalObjState === 'running') return null
    if (!this.shouldUseRealBackend()) return null

    if (await this.ensurePersonalObjApplied()) {
      return {
        status: 'done',
        objUrl: this.personalObjCache?.objUrl || this.getRenderer()?.personalObjUrl,
        source: this.personalObjCache?.source || 'cached-3ddfa-v3',
      }
    }

    const renderer = this.getRenderer()
    if (!renderer || !renderer.isInitialized || renderer.isPersonalObjActive) return null

    const faceImagesBase64 = options.faceImagesBase64 || (
      options.faceImageBase64
        ? [options.faceImageBase64]
        : await this.captureFaceImageBurstBase64({ samples: 5, intervalMs: 150 })
    )
    const faceImageBase64 = options.faceImageBase64 || faceImagesBase64[0] || this.captureFaceImageBase64()
    if (!faceImageBase64) return null

    this.personalObjState = 'running'
    this.lastPersonalObjAttemptAt = Date.now()

    try {
      const payload = {
        sessionId: this.getSessionId(),
        textureKey: options.textureKey || this.getTextureKey(),
        reconstructionProfile: options.reconstructionProfile || this.reconstructionProfile,
        faceImageBase64,
        faceImagesBase64,
        captureFrames: options.captureFrames || this.lastCaptureFrames || [],
        landmarks468: this.getLandmarks468(),
        timestamp: Date.now(),
      }

      const createdJob = await this.postPersonalFaceJob(payload)
      const finalJob = await this.pollPersonalFaceJob(createdJob.jobId)
      if (finalJob.status === 'done' && finalJob.objUrl) {
        const applied = await this.applyPersonalObj(finalJob.objUrl)
        this.personalObjState = applied ? 'done' : 'failed'
        if (applied) {
          this.savePersonalObjCache({
            sessionId: payload.sessionId,
            objUrl: finalJob.objUrl,
            source: finalJob.source || '3ddfa-v3',
          })
        }
        if (applied && !options.quiet) {
          this.writeLog('3DDFA-V3 personal OBJ is now driving realtime facepaint.', 'success')
        }
        return finalJob
      }

      this.personalObjState = 'failed'
      return finalJob
    } catch (error) {
      this.personalObjState = 'failed'
      if (!options.quiet) {
        this.writeLog('3DDFA-V3 personal OBJ reconstruction is unavailable.', 'warning')
      }
      return null
    }
  }

  async maybeStartPersonalObjBootstrap() {
    if (this.personalObjState === 'running' || this.personalObjState === 'done') return
    if (await this.ensurePersonalObjApplied()) return
  }

  async runCachedPersonalObjGeneration(textureKey) {
    const applied = await this.ensurePersonalObjApplied()
    if (!applied) return false

    const cachedSteps = [
      '已读取首次生成的用户专属 OBJ',
      '已锁定用户个人脸型资产',
      '个人脸型适配中',
      '脸谱 UV 锚点匹配中',
      '三维脸谱贴图生成中',
      '法线与材质烘焙中',
      '已复用首次生成的个人 OBJ',
      '已加入脸谱陈列馆',
    ]

    for (let i = 0; i < cachedSteps.length; i += 1) {
      await this.advanceStep(i, cachedSteps[i])
    }

    const renderer = this.getRenderer()
    const snapshot = this.captureFallbackSnapshot(renderer, {
      textureKey,
      allowHidden: true,
    })
    const cache = this.personalObjCache || this.loadPersonalObjCache()
    let finalLabel = cachedSteps[7]

    if (snapshot) {
      this.safeAddToGallery({
        ...snapshot,
        type: 'personal-obj-snapshot',
        title: '用户个人专属三维脸谱面罩',
        textureKey,
        objUrl: cache?.objUrl || renderer?.personalObjUrl || '',
        source: 'cached-3ddfa-v3-obj',
        timestamp: Date.now(),
      })
    } else {
      finalLabel = '已复用首次生成的个人 OBJ，当前画面暂不可入藏'
    }

    this.pushStatus({ type: 'finish', index: 7, label: finalLabel, message: '生成完成' })
    return true
  }

  async runLocalMockGeneration(textureKey, fallbackSnapshot, fallbackObjText) {
    await this.advanceStep(
      0,
      fallbackSnapshot ? this.steps[0] : '实时三维脸谱快照暂不可用',
    )
    await this.advanceStep(
      1,
      fallbackObjText ? this.steps[1] : '当前人脸网格 OBJ 导出失败，将使用快照降级',
    )

    for (let i = 2; i <= 6; i += 1) {
      await this.advanceStep(i, this.steps[i])
    }

    const glbUrl = this.getGlbUrl(textureKey)
    const glbExists = await this.hasGlb(glbUrl)
    let finalLabel = this.steps[7]

    if (glbExists) {
      this.safeAddToGallery({
        type: 'hq-glb',
        title: '个人专属三维脸谱面罩',
        textureKey,
        glbUrl,
        fallbackSnapshot,
        source: 'snapshot-obj',
        timestamp: Date.now(),
      })
    } else if (fallbackSnapshot) {
      finalLabel = '三维脸谱资产缓存未找到，已保存实时三维脸谱快照'
      this.addSnapshotFallback(textureKey, fallbackSnapshot)
    } else {
      finalLabel = '三维脸谱资产缓存未找到，实时三维脸谱快照暂不可用'
    }

    await this.advanceStep(7, finalLabel)
    this.pushStatus({ type: 'finish', index: 7, label: finalLabel, message: '生成完成' })
  }

  async runBackendGeneration(textureKey, fallbackSnapshot, fallbackObjText) {
    const faceImagesBase64 = await this.captureFaceImageBurstBase64({ samples: 5, intervalMs: 150 })
    const faceImageBase64 = faceImagesBase64[0] || this.captureFaceImageBase64()
    await this.advanceStep(
      0,
      faceImagesBase64.length > 1
        ? `已采集 ${faceImagesBase64.length} 帧多角度人脸`
        : (faceImageBase64 ? '已采集 1 帧人脸画面' : '实时人脸画面暂不可用'),
    )
    await this.advanceStep(
      1,
      faceImagesBase64.length > 1
        ? '将筛选清晰帧与左右转头覆盖后生成面罩资产'
        : '将使用单帧生成个性化三维脸谱面罩',
    )

    const sessionId = this.getSessionId()
    const payload = {
      sessionId,
      textureKey,
      reconstructionProfile: this.reconstructionProfile,
      faceImageBase64,
      faceImagesBase64,
      captureFrames: this.lastCaptureFrames || [],
      landmarks468: this.getLandmarks468(),
      fallbackObjText,
      timestamp: Date.now(),
    }

    let createdJob
    try {
      createdJob = await this.postBackendJob(payload)
    } catch (error) {
      const label = fallbackSnapshot
        ? '后台服务暂不可用，已保存实时三维脸谱快照'
        : '后台服务暂不可用，实时三维脸谱快照暂不可用'
      this.writeLog(label, 'warning')
      this.finishWithSnapshotFallback(textureKey, fallbackSnapshot, label)
      return
    }

    this.mapBackendStatus({ status: createdJob.status || 'queued' })

    let finalJob
    try {
      finalJob = await this.pollBackendJob(createdJob.jobId)
    } catch (error) {
      const label = fallbackSnapshot
        ? '后台服务暂不可用，已保存实时三维脸谱快照'
        : '后台服务暂不可用，实时三维脸谱快照暂不可用'
      this.writeLog(label, 'warning')
      this.finishWithSnapshotFallback(textureKey, fallbackSnapshot, label)
      return
    }

    if (finalJob.status === 'done' && finalJob.glbUrl) {
      const finalLabel = this.backendStatusMap.done.label
      if (finalJob.objUrl) {
        const applied = await this.applyPersonalObj(finalJob.objUrl)
        if (applied) {
          this.savePersonalObjCache({
            sessionId,
            objUrl: finalJob.objUrl,
            source: finalJob.source || '3ddfa-v3',
          })
        }
      }
      this.safeAddToGallery({
        type: 'hq-glb',
        title: '个人专属三维脸谱面罩',
        textureKey,
        glbUrl: finalJob.glbUrl,
        objUrl: finalJob.objUrl || '',
        fallbackSnapshot,
        source: finalJob.source || 'fallback-obj',
        manifestUrl: finalJob.manifestUrl || '',
        captureManifest: finalJob.captureManifest || null,
        normalMapUrl: finalJob.normalMapUrl || '',
        timestamp: Date.now(),
      })
      this.pushStatus({ type: 'finish', index: 7, label: finalLabel, message: '生成完成' })
      return
    }

    if (finalJob.status === 'failed') {
      const finalLabel = this.backendStatusMap.failed.label
      this.writeLog(finalLabel, 'warning')
      this.finishWithSnapshotFallback(textureKey, fallbackSnapshot, finalLabel)
      return
    }

    const label = fallbackSnapshot
      ? '三维脸谱面罩暂不可用，已保存实时三维脸谱快照'
      : '三维脸谱面罩暂不可用，实时三维脸谱快照暂不可用'
    this.finishWithSnapshotFallback(textureKey, fallbackSnapshot, label)
  }

  async startDemoGeneration() {
    if (this.isGenerating) {
      const message = '当前生成任务正在进行中'
      this.pushStatus({ type: 'busy', message })
      this.writeLog(message, 'warning')
      return null
    }

    this.isGenerating = true
    this.pushStatus({ type: 'start', steps: this.steps.slice() })

    try {
      const renderer = this.getRenderer()
      const textureKey = this.getTextureKey()
      if (this.personalObjState === 'running') {
        await this.advanceStep(0, '首次用户专属 OBJ 正在生成中')
        await this.advanceStep(1, '正在等待个人脸型资产输出')
        if (await this.waitForPersonalObjReady()) {
          await this.runCachedPersonalObjGeneration(textureKey)
          return this.personalObjCache
        }
        const label = '首次用户专属 OBJ 仍在生成中，请稍后重试'
        this.pushStatus({ type: 'finish', index: 7, label, message: '生成完成' })
        return null
      }

      if (await this.ensurePersonalObjApplied()) {
        await this.runCachedPersonalObjGeneration(textureKey)
        return this.personalObjCache
      }

      const fallbackSnapshot = this.captureFallbackSnapshot(renderer)
      const fallbackObjText = this.exportFallbackObj(renderer)
      this.persistFallback(textureKey, fallbackSnapshot, fallbackObjText)

      if (this.shouldUseRealBackend()) {
        await this.runBackendGeneration(textureKey, fallbackSnapshot, fallbackObjText)
      } else {
        await this.runLocalMockGeneration(textureKey, fallbackSnapshot, fallbackObjText)
      }

      return window.__lastHqMaskFallback
    } catch (error) {
      const finalLabel = '生成流程暂不可用，请稍后重试'
      this.writeLog(finalLabel, 'warning')
      this.pushStatus({ type: 'finish', index: 7, label: finalLabel, message: '生成完成' })
      return window.__lastHqMaskFallback || null
    } finally {
      this.isGenerating = false
    }
  }
}

window.BackendMaskClient = BackendMaskClient
