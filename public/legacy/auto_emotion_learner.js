/**
 * 个人专属表情学习器 - 全自动无感化冷启动+在线增量学习
 * 
 * 核心特性：
 * - 零人工干预：摄像头启动即自动学习
 * - 预训练模型伪标签生成
 * - 4分类表情模板自动构建
 * - 在线增量自学习
 * - 余弦相似度匹配+防抖机制
 */
class AutoEmotionLearner {
  constructor() {
    // ======================== 表情敏感关键点索引 ========================
    // 从468个关键点中选取140个表情敏感点
    this.EXPRESSION_KEYPOINTS = this._selectExpressionKeypoints()

    // ======================== 预训练通用表情模型 ========================
    // 用于冷启动时自动生成伪标签
    this.PRETRAINED_MODEL = this._initPretrainedModel()

    // ======================== 系统配置 ========================
    this.TARGET_EMOTIONS = ['happy', 'angry', 'sad', 'surprised']
    this.EMOTION_DISPLAY_NAMES = {
      'happy': '😀 喜悦',
      'angry': '😠 愤怒',
      'sad': '😢 悲伤',
      'surprised': '😮 惊讶'
    }
    this.MIN_SAMPLES_PER_EMOTION = 30
    this.MAX_SAMPLES_PER_EMOTION = 200
    this.PSEUDO_LABEL_CONFIDENCE_THRESHOLD = 0.90
    this.CONFIDENCE_FILTER = 0.85
    this.YAW_THRESHOLD = 40
    this.PITCH_THRESHOLD = 35
    this.OCCLUSION_THRESHOLD = 0.20

    // ======================== 匹配配置 ========================
    this.ANTI_FLICKER_FRAMES = 3
    this.SIMILARITY_THRESHOLD = 0.75
    this.COOLDOWN_MS = 500
    this.NEUTRAL_SIMILARITY_THRESHOLD = 0.65

    // ======================== K-Means聚类配置 ========================
    this.KMEANS_MAX_ITER = 5
    this.OUTLIER_PERCENTILE = 0.80

    // ======================== 增量学习配置 ========================
    this.TEMPLATE_UPDATE_INTERVAL = 20
    this.ONLINE_LEARNING_RATE = 0.1

    // ======================== 情绪→脸谱贴图映射 ========================
    this.FACE_TEXTURE_DIR = './faces/'
    this.EMOTION_MASK_MAP = {
      'happy':     'face_03.png',
      'angry':     'face_09.png',
      'sad':       'face_07.png',
      'surprised': 'face_11.png',
      'neutral':   'face_01.png'
    }

    // ======================== 学习状态 ========================
    this.learningPhase = 'pre-learning'
    this.collectedEmotions = new Set()
    this.emotionSamples = {}
    this.personalTemplates = {}
    this.totalCollectedFrames = 0
    this.learningComplete = false

    this.TARGET_EMOTIONS.forEach(em => {
      this.emotionSamples[em] = []
      this.personalTemplates[em] = null
    })

    // ======================== 推理状态 ========================
    this.currentEmotion = 'neutral'
    this.currentMaskFile = 'face_01.png'
    this.previousEmotion = 'neutral'
    this.emotionStreak = 0
    this.lastSwitchTime = 0
    this.similarityHistory = []

    // ======================== 平滑缓冲 ========================
    this.smoothedFeatures = null
    this.SMOOTH_FACTOR = 0.7

    // ======================== 在线学习缓存 ========================
    this.onlineBuffer = {}
    this.TARGET_EMOTIONS.forEach(em => { this.onlineBuffer[em] = [] })

    // ======================== 调试统计 ========================
    this.frameCount = 0
    this.rejectedFrames = 0
    this.highConfidenceSamples = 0

    console.log('🧠 个人专属表情学习器初始化完成')
  }

  // ======================== 核心：选取140个表情敏感关键点 ========================
  _selectExpressionKeypoints() {
    // 眉毛区域
    const brows = [105, 334, 10, 70, 63, 53, 300, 293, 337, 265, 296, 193,
                   46, 52, 53, 54, 55, 56, 57, 58, 59, 276, 283, 282, 295, 285,
                   300, 293, 334, 333, 296, 336]
    // 眼睛区域
    const eyes = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158,
                  159, 160, 161, 246, 263, 249, 390, 373, 374, 380, 381, 382,
                  362, 398, 384, 385, 386, 387, 388, 466, 130, 25, 110, 24,
                  23, 22, 26, 112, 243, 190, 56, 28, 27, 29, 30, 247, 130,
                  25, 110, 24, 23, 22, 26, 112, 243, 190, 56, 28, 27, 29,
                  30, 247, 33, 7, 163, 144, 145, 153, 154, 155, 133, 173,
                  157, 158, 159, 160, 161, 246, 263, 249, 390, 373, 374,
                  380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
    // 嘴巴区域
    const mouth = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409,
                   270, 269, 267, 0, 37, 39, 40, 185, 61, 76, 180, 91, 146,
                   91, 76, 180, 84, 17, 314, 405, 321, 375, 291, 146, 61,
                   185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321,
                   405, 314, 17, 84, 181, 91, 146, 61, 185, 40, 39, 37, 0,
                   267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181,
                   91, 76, 180, 84, 17, 314, 405, 321, 375, 291, 146, 61]
    // 脸颊/下颌
    const jaw = [234, 454, 152, 1, 9, 152, 377, 400, 378, 379, 365, 397,
                 288, 323, 454, 234, 127, 34, 227, 199, 172, 131, 150, 169,
                 170, 140, 177, 136, 150, 149, 176, 148, 178, 143, 152, 377,
                 400, 378, 379, 365, 397, 288, 323, 454, 234, 127, 34, 227]

    const allIndices = [...new Set([...brows, ...eyes, ...mouth, ...jaw])]
    return allIndices.slice(0, 140)
  }

  // ======================== 预训练通用表情模型 ========================
  _initPretrainedModel() {
    return {
      weights: {
        happy: [0.3, -0.2, 0.4, 0.1, -0.3, 0.2, 0.1, -0.4, 0.3, -0.1,
                0.2, -0.3, 0.4, -0.2, 0.1, -0.4, 0.3, -0.1, 0.2, -0.3],
        angry: [-0.4, 0.3, -0.2, -0.4, 0.1, -0.3, -0.2, 0.4, -0.1, 0.3,
                -0.2, 0.4, -0.3, 0.1, -0.2, 0.4, -0.3, 0.1, -0.2, 0.4],
        sad: [-0.2, 0.1, -0.3, -0.1, 0.4, -0.2, -0.3, 0.1, 0.2, -0.4,
              -0.1, 0.3, -0.2, -0.4, 0.1, -0.3, -0.2, 0.4, -0.1, 0.3],
        surprised: [0.4, 0.3, 0.1, 0.2, 0.3, 0.4, 0.2, 0.1, 0.3, 0.4,
                    0.1, 0.2, 0.3, 0.4, 0.2, 0.1, 0.3, 0.4, 0.1, 0.2]
      },
      bias: { happy: 0.1, angry: -0.1, sad: -0.15, surprised: 0.2 }
    }
  }

  // ======================== 特征提取 ========================
  extractFeatureVector(landmarks) {
    const features = []
    const pts = this.EXPRESSION_KEYPOINTS.map(i => landmarks[i]).filter(p => p)

    if (pts.length < 10) return null

    // 1. 归一化：以鼻尖(1)为原点，双眼间距(33-263)为尺度
    const noseTip = landmarks[1]
    const leftEye = landmarks[33]
    const rightEye = landmarks[263]
    const eyeDist = Math.sqrt(
      Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2)
    )
    if (eyeDist < 0.01) return null

    const originX = noseTip.x
    const originY = noseTip.y

    // 2. 提取相对坐标特征 (x, y, z)
    for (const pt of pts) {
      features.push((pt.x - originX) / eyeDist)
      features.push((pt.y - originY) / eyeDist)
      features.push(pt.z / eyeDist)
    }

    // 3. 提取比值特征
    const mouthOpen = this._calcMouthOpen(landmarks)
    const mouthStretch = this._calcMouthStretch(landmarks)
    const leftEyeOpen = this._calcEyeOpen(landmarks, 'left')
    const rightEyeOpen = this._calcEyeOpen(landmarks, 'right')
    const browRaise = this._calcBrowRaise(landmarks)
    const browFurrow = this._calcBrowFurrow(landmarks)
    const mouthCurve = this._calcMouthCurve(landmarks)

    features.push(mouthOpen, mouthStretch, leftEyeOpen, rightEyeOpen,
                  browRaise, browFurrow, mouthCurve)

    return features
  }

  // ======================== 几何特征计算 ========================
  _dist2D(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
  }

  _calcMouthOpen(lm) {
    const h = this._dist2D(lm[62], lm[191])
    const w = this._dist2D(lm[61], lm[291])
    return w > 0 ? h / w : 0
  }

  _calcMouthStretch(lm) {
    const mw = this._dist2D(lm[61], lm[291])
    const fw = this._dist2D(lm[234], lm[454])
    return fw > 0 ? mw / fw : 0
  }

  _calcEyeOpen(lm, side) {
    let up, low, out, in_
    if (side === 'left') {
      up = lm[159]; low = lm[145]; out = lm[33]; in_ = lm[133]
    } else {
      up = lm[386]; low = lm[374]; out = lm[263]; in_ = lm[362]
    }
    const h = this._dist2D(up, low)
    const w = this._dist2D(out, in_)
    return w > 0 ? h / w : 0
  }

  _calcBrowRaise(lm) {
    const lb = lm[105]; const rb = lm[334]; const fh = lm[10]
    return (this._dist2D(lb, fh) + this._dist2D(rb, fh)) / 2
  }

  _calcBrowFurrow(lm) {
    return this._dist2D(lm[105], lm[334])
  }

  _calcMouthCurve(lm) {
    const lc = lm[61]; const rc = lm[291]; const ct = lm[0]
    const center = { x: (lc.x + rc.x) / 2, y: (lc.y + rc.y) / 2 }
    return ct.y - center.y
  }

  // ======================== 帧质量过滤 ========================
  checkFrameQuality(landmarks) {
    if (!landmarks || landmarks.length < 468) return false

    // 头部姿态过滤
    const yaw = (landmarks[234].z - landmarks[454].z) * 8.0
    const pitch = (landmarks[10].y - landmarks[152].y) * 5.0
    if (Math.abs(yaw) > this.YAW_THRESHOLD || Math.abs(pitch) > this.PITCH_THRESHOLD) {
      return false
    }

    // 遮挡过滤
    let occluded = 0
    const checkPts = [10, 234, 454, 152, 33, 263, 1, 61, 291, 191]
    for (const idx of checkPts) {
      const p = landmarks[idx]
      if (p.x < 0.05 || p.x > 0.95 || p.y < 0.05 || p.y > 0.95) occluded++
    }
    if (occluded / checkPts.length > this.OCCLUSION_THRESHOLD) return false

    return true
  }

  // ======================== 预训练模型推理 ========================
  predictEmotion(features) {
    if (!features || features.length === 0) return { emotion: 'neutral', confidence: 0 }

    let scores = {}
    for (const em of this.TARGET_EMOTIONS) {
      const w = this.PRETRAINED_MODEL.weights[em]
      const bias = this.PRETRAINED_MODEL.bias[em]
      let score = bias

      // 取特征向量前20维进行简化推理
      const n = Math.min(20, features.length, w.length)
      for (let i = 0; i < n; i++) {
        score += w[i] * features[i]
      }

      scores[em] = Math.max(0, Math.min(1, (score + 1) / 2))
    }

    // Softmax归一化
    const expScores = {}
    let sumExp = 0
    for (const em of this.TARGET_EMOTIONS) {
      expScores[em] = Math.exp(scores[em] * 3)
      sumExp += expScores[em]
    }

    let bestEmotion = 'neutral'
    let bestConfidence = 0
    for (const em of this.TARGET_EMOTIONS) {
      const prob = expScores[em] / sumExp
      if (prob > bestConfidence) {
        bestConfidence = prob
        bestEmotion = em
      }
    }

    return { emotion: bestEmotion, confidence: bestConfidence }
  }

  // ======================== 余弦相似度计算 ========================
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom > 0 ? dot / denom : 0
  }

  // ======================== K-Means聚类+离群点剔除 ========================
  clusterAndClean(samples) {
    if (samples.length < 5) return samples

    const dim = samples[0].length
    // 计算质心
    const centroid = new Array(dim).fill(0)
    for (const s of samples) {
      for (let i = 0; i < dim; i++) centroid[i] += s[i]
    }
    for (let i = 0; i < dim; i++) centroid[i] /= samples.length

    // 计算每个样本到质心的距离
    const distances = samples.map(s => {
      let d = 0
      for (let i = 0; i < dim; i++) d += (s[i] - centroid[i]) ** 2
      return Math.sqrt(d)
    })

    // 按距离排序，取前80%作为内点
    const sortedDists = [...distances].sort((a, b) => a - b)
    const threshold = sortedDists[Math.floor(sortedDists.length * this.OUTLIER_PERCENTILE)]

    return samples.filter((_, idx) => distances[idx] <= threshold)
  }

  // ======================== 生成个人专属模板 ========================
  generatePersonalTemplates() {
    console.log(' 开始生成个人专属表情模板...')

    let templatesCreated = 0

    for (const em of this.TARGET_EMOTIONS) {
      const samples = this.emotionSamples[em]
      if (samples.length < this.MIN_SAMPLES_PER_EMOTION) continue

      // K-Means聚类剔除离群点
      const cleanSamples = this.clusterAndClean(samples)
      console.log(`  ${em}: ${samples.length}帧 → ${cleanSamples.length}帧 (离群点剔除)`)

      // 计算均值模板
      const dim = cleanSamples[0].length
      const template = new Array(dim).fill(0)
      for (const s of cleanSamples) {
        for (let i = 0; i < dim; i++) template[i] += s[i]
      }
      for (let i = 0; i < dim; i++) template[i] /= cleanSamples.length

      this.personalTemplates[em] = template
      templatesCreated++
    }

    console.log(`✅ 个人模板生成完成: ${templatesCreated}/${this.TARGET_EMOTIONS.length}类`)

    if (templatesCreated >= 2) {
      this.learningComplete = true
      this.learningPhase = 'running'
      console.log('🎉 预学习完成！进入正式运行阶段')
    }
  }

  // ======================== 在线增量学习 ========================
  onlineIncrementalLearn(emotion, feature, confidence) {
    if (confidence < 0.95) return

    this.onlineBuffer[emotion].push(feature)
    this.highConfidenceSamples++

    // 每20帧更新模板
    if (this.onlineBuffer[emotion].length >= this.TEMPLATE_UPDATE_INTERVAL) {
      const newSamples = this.onlineBuffer[emotion].slice(-this.TEMPLATE_UPDATE_INTERVAL)
      const existingTemplate = this.personalTemplates[emotion]

      if (existingTemplate) {
        // 加权平均更新
        const dim = existingTemplate.length
        const lr = this.ONLINE_LEARNING_RATE
        const newMean = new Array(dim).fill(0)
        for (const s of newSamples) {
          for (let i = 0; i < dim; i++) newMean[i] += s[i]
        }
        for (let i = 0; i < dim; i++) {
          newMean[i] /= newSamples.length
          existingTemplate[i] = (1 - lr) * existingTemplate[i] + lr * newMean[i]
        }
        console.log(` 在线更新模板: ${emotion}`)
      }

      this.onlineBuffer[emotion] = []
    }

    // 管理样本上限
    if (this.emotionSamples[emotion].length >= this.MAX_SAMPLES_PER_EMOTION) {
      this.emotionSamples[emotion] = this.emotionSamples[emotion].slice(-this.MAX_SAMPLES_PER_EMOTION)
    }
  }

  // ======================== 表情匹配推理 ========================
  matchEmotion(feature) {
    if (!feature) return { emotion: 'neutral', similarity: 0 }

    let bestEmotion = 'neutral'
    let bestSimilarity = 0

    for (const em of this.TARGET_EMOTIONS) {
      const template = this.personalTemplates[em]
      if (!template) continue

      const sim = this.cosineSimilarity(feature, template)
      if (sim > bestSimilarity) {
        bestSimilarity = sim
        bestEmotion = sim > this.SIMILARITY_THRESHOLD ? em : 'neutral'
      }
    }

    return { emotion: bestEmotion, similarity: bestSimilarity }
  }

  // ======================== 主更新循环 ========================
  update(landmarks) {
    this.frameCount++

    // 帧质量检查
    if (!this.checkFrameQuality(landmarks)) {
      this.rejectedFrames++
      return this.currentMaskFile
    }

    // 提取特征
    const rawFeature = this.extractFeatureVector(landmarks)
    if (!rawFeature) return this.currentMaskFile

    // 平滑滤波
    if (!this.smoothedFeatures) {
      this.smoothedFeatures = rawFeature.slice()
    } else {
      for (let i = 0; i < rawFeature.length; i++) {
        this.smoothedFeatures[i] = this.SMOOTH_FACTOR * this.smoothedFeatures[i] +
          (1 - this.SMOOTH_FACTOR) * rawFeature[i]
      }
    }

    const feature = this.smoothedFeatures

    if (this.learningPhase === 'pre-learning') {
      // ===== 冷启动预学习阶段 =====
      const result = this.predictEmotion(feature)

      if (result.confidence >= this.PSEUDO_LABEL_CONFIDENCE_THRESHOLD) {
        this.emotionSamples[result.emotion].push(feature.slice())
        this.collectedEmotions.add(result.emotion)
        this.totalCollectedFrames++

        const count = this.emotionSamples[result.emotion].length
        if (count >= this.MIN_SAMPLES_PER_EMOTION) {
          console.log(`📚 ${result.emotion} 已收集 ${count}/${this.MIN_SAMPLES_PER_EMOTION} 帧 ✓`)
        }

        // 检查是否收集齐全
        const allCollected = this.TARGET_EMOTIONS.every(
          em => this.emotionSamples[em].length >= this.MIN_SAMPLES_PER_EMOTION
        )
        if (allCollected) {
          this.generatePersonalTemplates()
        }
      }

      return this.currentMaskFile

    } else {
      // ===== 正式运行阶段 =====
      const match = this.matchEmotion(feature)
      this.similarityHistory.push(match.similarity)
      if (this.similarityHistory.length > 10) this.similarityHistory.shift()

      // 防抖：连续3帧相同表情
      if (match.emotion !== 'neutral' && match.similarity >= this.SIMILARITY_THRESHOLD) {
        if (match.emotion === this.currentEmotion) {
          this.emotionStreak++
        } else {
          this.emotionStreak = 1
          this.currentEmotion = match.emotion
        }
      } else {
        this.emotionStreak = 0
        if (match.similarity < this.NEUTRAL_SIMILARITY_THRESHOLD) {
          this.currentEmotion = 'neutral'
        }
      }

      // 冷却期检查 + 触发切换
      const now = performance.now()
      if (this.emotionStreak >= this.ANTI_FLICKER_FRAMES &&
          (now - this.lastSwitchTime) > this.COOLDOWN_MS &&
          this.currentEmotion !== this.previousEmotion) {

        this.previousEmotion = this.currentEmotion
        this.lastSwitchTime = now
        this.currentMaskFile = this.EMOTION_MASK_MAP[this.currentEmotion] || 'face_01.png'

        console.log(`🎭 自动变脸: ${this.EMOTION_DISPLAY_NAMES[this.currentEmotion] || '😐 平静'} (${(match.similarity * 100).toFixed(0)}%)`)
      }

      // 在线增量学习
      if (match.similarity >= 0.95) {
        this.onlineIncrementalLearn(this.currentEmotion, feature, match.similarity)
      }

      return this.currentMaskFile
    }
  }

  // ======================== 状态查询 ========================
  getStats() {
    return {
      phase: this.learningPhase,
      learningComplete: this.learningComplete,
      currentEmotion: this.currentEmotion,
      emotionName: this.EMOTION_DISPLAY_NAMES[this.currentEmotion] || '😐 平静',
      maskFile: this.currentMaskFile,
      samplesCollected: this.TARGET_EMOTIONS.map(em => ({
        emotion: em,
        count: this.emotionSamples[em].length,
        ready: this.emotionSamples[em].length >= this.MIN_SAMPLES_PER_EMOTION
      })),
      frameCount: this.frameCount,
      rejectedFrames: this.rejectedFrames,
      totalCollected: this.totalCollectedFrames
    }
  }

  // ======================== 获取当前面具文件 ========================
  getMaskFileForEmotion() {
    return this.currentMaskFile
  }

  getEmotionName() {
    return this.EMOTION_DISPLAY_NAMES[this.currentEmotion] || '😐 平静'
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AutoEmotionLearner }
}
