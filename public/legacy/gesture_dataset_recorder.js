(function () {
  const LABELS = ['vertical_swipe', 'cover_face', 'head_shake', 'head_nod', 'raise_hand', 'idle']
  const TARGET_PER_LABEL = 30
  const MIN_VALID_FRAMES = 8
  const IDEAL_MIN_AVG_FRAMES = 16
  const HAND_REQUIRED_LABELS = new Set(['vertical_swipe', 'cover_face', 'raise_hand'])
  const LABEL_STANDARDS = {
    vertical_swipe: {
      name: '纵向挥手',
      source: 'HandFaceSwipeDetector.checkVerticalCrossing + TemporalGestureRecognizer.classifyHandSequence',
      instruction: '手掌张开或自然伸指，从脸部上方向下划过，或从下方向上划过；手要经过脸部核心区域。',
      success: '垂直位移约大于 0.55 个脸高，垂直方向占主导，至少三分之一帧靠近脸。',
    },
    cover_face: {
      name: '遮脸',
      source: 'shouldFreezeMaskForHandOcclusion',
      instruction: '手掌靠近脸部中间区域，遮住鼻口或半张脸，停留 1 秒左右；不要完全把脸移出画面。',
      success: '手腕/掌根/掌心关键点有至少 2 个进入脸部核心区域，或手掌中心进入核心区域。',
    },
    head_shake: {
      name: '左右转头',
      source: 'detectHeadShake + TemporalGestureRecognizer.classifyPoseSequence',
      instruction: '手离开脸，正对镜头开始，快速 左-右-左 或 右-左-右 转头。',
      success: 'yaw 摆动范围约大于 28°，并出现至少 2 次方向变化。',
    },
    head_nod: {
      name: '点头',
      source: 'detectHeadNod + TemporalGestureRecognizer.classifyPoseSequence',
      instruction: '手离开脸，先正视镜头，再明显低头或抬头一次，最后尽量回正。',
      success: 'pitch 摆动范围约大于 6°，起止姿态差约大于 4°。',
    },
    raise_hand: {
      name: '举手',
      source: 'detectFireCondition',
      instruction: '轻微转头，同时举同侧手；手腕在画面上半部，手离脸中心至少半个脸宽。',
      success: '手腕 y 小于 0.75，手离脸中心 x 距离约大于 0.55 个脸宽，头部 yaw 大于 0.18 弧度。',
    },
    idle: {
      name: '静止/无动作',
      source: 'negative samples for temporal gesture classifier',
      instruction: '正常看屏幕，手离开脸，保持自然轻微晃动，不做挥手、遮脸、转头、点头、举手动作。',
      success: 'yaw/pitch 波动小，手不靠近脸，作为模型的负样本。',
    },
  }

  function round(value, digits = 5) {
    if (!Number.isFinite(value)) return null
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
  }

  function compactPoint(point) {
    if (!point) return null
    return [round(point.x), round(point.y), round(point.z || 0)]
  }

  function faceBox(faceLandmarks) {
    if (!faceLandmarks || !faceLandmarks.length) return null
    const xs = faceLandmarks.map((point) => point.x)
    const ys = faceLandmarks.map((point) => point.y)
    const left = Math.min(...xs)
    const right = Math.max(...xs)
    const top = Math.min(...ys)
    const bottom = Math.max(...ys)
    return {
      cx: round((left + right) * 0.5),
      cy: round((top + bottom) * 0.5),
      width: round(right - left),
      height: round(bottom - top),
    }
  }

  function compactFaceAnchors(faceLandmarks) {
    if (!faceLandmarks || faceLandmarks.length < 468) return []
    const indices = [1, 10, 33, 61, 152, 199, 234, 263, 291, 454]
    return indices.map((index) => compactPoint(faceLandmarks[index]))
  }

  function compactHands(handsResults) {
    const hands = handsResults?.multiHandLandmarks || []
    return hands.slice(0, 2).map((hand) => hand.map(compactPoint))
  }

  function hasFaceSignal(frame) {
    return !!frame?.faceBox || (Array.isArray(frame?.faceAnchors) && frame.faceAnchors.length > 0)
  }

  function hasHandSignal(frame) {
    if (Array.isArray(frame?.selectedHand) && frame.selectedHand.length > 0) return true
    return Array.isArray(frame?.hands) && frame.hands.some((hand) => Array.isArray(hand) && hand.length > 0)
  }

  function frameHands(frame) {
    if (Array.isArray(frame?.selectedHand) && frame.selectedHand.length > 0) return [frame.selectedHand]
    return Array.isArray(frame?.hands) ? frame.hands.filter((hand) => Array.isArray(hand) && hand.length > 0) : []
  }

  function palmPoints(hand) {
    const indices = [0, 5, 9, 13, 17]
    return indices.map((index) => hand?.[index]).filter(Boolean)
  }

  function pointAverage(points) {
    if (!points.length) return null
    const sum = points.reduce((acc, point) => {
      acc.x += Number(point?.[0]) || 0
      acc.y += Number(point?.[1]) || 0
      return acc
    }, { x: 0, y: 0 })
    return { x: sum.x / points.length, y: sum.y / points.length }
  }

  function primaryHandCenter(frame) {
    const hand = frameHands(frame)[0]
    return hand ? pointAverage(palmPoints(hand)) : null
  }

  function primaryWrist(frame) {
    const hand = frameHands(frame)[0]
    const wrist = hand?.[0]
    return wrist ? { x: Number(wrist[0]) || 0, y: Number(wrist[1]) || 0 } : null
  }

  function relativeToFace(point, faceBox) {
    if (!point || !faceBox?.width || !faceBox?.height) return null
    return {
      x: (point.x - faceBox.cx) / Math.max(faceBox.width, 0.001),
      y: (point.y - faceBox.cy) / Math.max(faceBox.height, 0.001),
    }
  }

  function valueRange(values) {
    const valid = values.filter(Number.isFinite)
    if (!valid.length) return 0
    return Math.max(...valid) - Math.min(...valid)
  }

  function directionChanges(values, epsilon = 1.2) {
    let changes = 0
    let previous = 0
    for (let i = 1; i < values.length; i += 1) {
      const delta = values[i] - values[i - 1]
      if (Math.abs(delta) < epsilon) continue
      const current = delta > 0 ? 1 : -1
      if (previous && current !== previous) changes += 1
      previous = current
    }
    return changes
  }

  function sampleMotion(sample) {
    const frames = Array.isArray(sample?.frames) ? sample.frames : []
    const handRel = []
    const wristRel = []
    const yawDeg = []
    const pitchDeg = []
    let handNearCount = 0
    let palmCoreCount = 0
    let raisedCount = 0
    let farSideCount = 0
    let sameSideCount = 0
    let sidePoseFrames = 0

    frames.forEach((frame) => {
      const face = frame.faceBox
      const center = primaryHandCenter(frame)
      const rel = relativeToFace(center, face)
      if (rel) {
        handRel.push(rel)
        const distance = Math.hypot(rel.x, rel.y)
        if (distance < 1.05) handNearCount += 1
      }

      const wrist = primaryWrist(frame)
      const wristPosition = relativeToFace(wrist, face)
      if (wristPosition) {
        wristRel.push(wristPosition)
        if (wrist.y <= 0.75) raisedCount += 1
        if (Math.abs(wristPosition.x) >= 0.55) farSideCount += 1
        if (Math.abs(Number(frame.yaw) || 0) >= 0.18) {
          sidePoseFrames += 1
          const headTurnedRight = (Number(frame.yaw) || 0) > 0
          const handOnScreenRight = wrist.x > face.cx
          const userRaisedRightHand = !handOnScreenRight
          if (headTurnedRight === userRaisedRightHand) sameSideCount += 1
        }
      }

      const hands = frameHands(frame)
      const coreHit = hands.some((hand) => {
        const points = palmPoints(hand)
        const corePoints = points.filter((point) => {
          const p = relativeToFace({ x: Number(point?.[0]) || 0, y: Number(point?.[1]) || 0 }, face)
          return p && p.x >= -0.38 && p.x <= 0.38 && p.y >= -0.42 && p.y <= 0.46
        })
        if (corePoints.length >= 2) return true
        const palmCenter = pointAverage(points)
        const relPalm = relativeToFace(palmCenter, face)
        return !!(relPalm && relPalm.x >= -0.38 && relPalm.x <= 0.38 && relPalm.y >= -0.42 && relPalm.y <= 0.46)
      })
      if (coreHit) palmCoreCount += 1

      const yaw = (Number(frame.yaw) || 0) * 180 / Math.PI
      const pitch = Number(frame.pitch) || 0
      yawDeg.push(yaw)
      pitchDeg.push(pitch)
    })

    const handX = handRel.map((point) => point.x)
    const handY = handRel.map((point) => point.y)
    const handXRange = valueRange(handX)
    const handYRange = valueRange(handY)
    const handTravel = Math.hypot(
      handRel.length > 1 ? handRel[handRel.length - 1].x - handRel[0].x : 0,
      handRel.length > 1 ? handRel[handRel.length - 1].y - handRel[0].y : 0,
    )
    const verticalDominance = handTravel ? Math.abs((handRel.at(-1)?.y || 0) - (handRel[0]?.y || 0)) / handTravel : 0
    const horizontalDominance = handTravel ? Math.abs((handRel.at(-1)?.x || 0) - (handRel[0]?.x || 0)) / handTravel : 0

    return {
      frameCount: frames.length,
      handFrameCount: handRel.length,
      yawDegRange: valueRange(yawDeg),
      yawTurns: directionChanges(yawDeg),
      maxAbsYawRad: Math.max(0, ...frames.map((frame) => Math.abs(Number(frame.yaw) || 0))),
      pitchRange: valueRange(pitchDeg),
      pitchStartEnd: pitchDeg.length > 1 ? Math.abs(pitchDeg[pitchDeg.length - 1] - pitchDeg[0]) : 0,
      handXRange,
      handYRange,
      verticalDominance,
      horizontalDominance,
      handNearRatio: handRel.length ? handNearCount / handRel.length : 0,
      palmCoreRatio: frames.length ? palmCoreCount / frames.length : 0,
      raisedRatio: wristRel.length ? raisedCount / wristRel.length : 0,
      farSideRatio: wristRel.length ? farSideCount / wristRel.length : 0,
      sameSideRatio: sidePoseFrames ? sameSideCount / sidePoseFrames : 0,
    }
  }

  function assessSample(sample, { minFrames = MIN_VALID_FRAMES } = {}) {
    const frames = Array.isArray(sample?.frames) ? sample.frames : []
    const label = String(sample?.label || 'unknown')
    const faceFrames = frames.filter(hasFaceSignal).length
    const handFrames = frames.filter(hasHandSignal).length
    const faceCoverage = frames.length ? faceFrames / frames.length : 0
    const handCoverage = frames.length ? handFrames / frames.length : 0
    const motion = sampleMotion(sample)
    const checks = []
    const add = (name, passed, detail) => checks.push({ name, passed: !!passed, detail })

    add('样本长度', frames.length >= minFrames, `${frames.length}/${minFrames} 帧`)
    add('人脸关键点', faceCoverage >= 0.65, `${round(faceCoverage, 3)}`)
    if (HAND_REQUIRED_LABELS.has(label)) {
      add('手部关键点', handCoverage >= 0.45, `${round(handCoverage, 3)}`)
    }

    if (label === 'vertical_swipe') {
      add('垂直位移', motion.handYRange >= 0.55, `${round(motion.handYRange, 3)} 个脸高`)
      add('垂直主导', motion.verticalDominance >= 0.68, `${round(motion.verticalDominance, 3)}`)
      add('靠近脸部', motion.handNearRatio >= 0.34, `${round(motion.handNearRatio, 3)}`)
    } else if (label === 'cover_face') {
      add('手掌进入脸部核心', motion.palmCoreRatio >= 0.45, `${round(motion.palmCoreRatio, 3)}`)
      add('持续遮挡', motion.handNearRatio >= 0.55, `${round(motion.handNearRatio, 3)}`)
    } else if (label === 'head_shake') {
      add('yaw 摆幅', motion.yawDegRange >= 28, `${round(motion.yawDegRange, 2)}°`)
      add('方向变化', motion.yawTurns >= 2, `${motion.yawTurns} 次`)
      add('手离开脸', motion.handNearRatio <= 0.2, `${round(motion.handNearRatio, 3)}`)
    } else if (label === 'head_nod') {
      add('pitch 摆幅', motion.pitchRange >= 6, `${round(motion.pitchRange, 2)}°`)
      add('起止差异', motion.pitchStartEnd >= 4, `${round(motion.pitchStartEnd, 2)}°`)
      add('手离开脸', motion.handNearRatio <= 0.2, `${round(motion.handNearRatio, 3)}`)
    } else if (label === 'raise_hand') {
      add('手在上半部', motion.raisedRatio >= 0.45, `${round(motion.raisedRatio, 3)}`)
      add('手远离脸中心', motion.farSideRatio >= 0.35, `${round(motion.farSideRatio, 3)}`)
      add('转头配合', motion.maxAbsYawRad >= 0.18, `${round(motion.maxAbsYawRad, 3)} rad`)
      add('同侧举手', motion.sameSideRatio >= 0.35, `${round(motion.sameSideRatio, 3)}`)
    } else if (label === 'idle') {
      add('yaw 保持稳定', motion.yawDegRange <= 12, `${round(motion.yawDegRange, 2)}°`)
      add('pitch 保持稳定', motion.pitchRange <= 6, `${round(motion.pitchRange, 2)}°`)
      add('手不靠近脸', motion.handNearRatio <= 0.15, `${round(motion.handNearRatio, 3)}`)
    }

    const passed = checks.every((check) => check.passed)
    const failedChecks = checks.filter((check) => !check.passed)
    return {
      label,
      passed,
      score: round(checks.filter((check) => check.passed).length / Math.max(checks.length, 1), 3),
      checks,
      warnings: failedChecks.map((check) => `${check.name}: ${check.detail}`),
      motion: {
        yawDegRange: round(motion.yawDegRange, 2),
        yawTurns: motion.yawTurns,
        pitchRange: round(motion.pitchRange, 2),
        handYRange: round(motion.handYRange, 3),
        verticalDominance: round(motion.verticalDominance, 3),
        handNearRatio: round(motion.handNearRatio, 3),
        palmCoreRatio: round(motion.palmCoreRatio, 3),
        raisedRatio: round(motion.raisedRatio, 3),
      },
    }
  }

  function analyzeSamples(samples, { targetPerLabel = TARGET_PER_LABEL, minFrames = MIN_VALID_FRAMES } = {}) {
    const byLabel = {}
    const perLabel = {}
    const frameCounts = []
    const tooShortSamples = []

    LABELS.forEach((label) => {
      byLabel[label] = 0
      perLabel[label] = {
        count: 0,
        frameTotal: 0,
        avgFrames: 0,
        minFrames: 0,
        maxFrames: 0,
        handCoverage: 0,
        faceCoverage: 0,
        ready: false,
      }
    })

    samples.forEach((sample) => {
      const label = String(sample?.label || 'unknown')
      const frames = Array.isArray(sample?.frames) ? sample.frames : []
      const frameCount = Number.isFinite(sample?.frameCount) ? sample.frameCount : frames.length
      const handFrames = frames.filter(hasHandSignal).length
      const faceFrames = frames.filter(hasFaceSignal).length
      byLabel[label] = (byLabel[label] || 0) + 1
      if (!perLabel[label]) {
        perLabel[label] = {
          count: 0,
          frameTotal: 0,
          avgFrames: 0,
          minFrames: 0,
          maxFrames: 0,
          handCoverage: 0,
          faceCoverage: 0,
          ready: false,
        }
      }
      const row = perLabel[label]
      row.count += 1
      row.frameTotal += frameCount
      row.minFrames = row.minFrames ? Math.min(row.minFrames, frameCount) : frameCount
      row.maxFrames = Math.max(row.maxFrames, frameCount)
      row.handCoverage += frameCount ? handFrames / frameCount : 0
      row.faceCoverage += frameCount ? faceFrames / frameCount : 0
      frameCounts.push(frameCount)
      if (frameCount < minFrames) {
        tooShortSamples.push({ id: sample?.id || '', label, frameCount })
      }
    })

    Object.keys(perLabel).forEach((label) => {
      const row = perLabel[label]
      if (!row.count) return
      row.avgFrames = round(row.frameTotal / row.count, 2)
      row.handCoverage = round(row.handCoverage / row.count, 3)
      row.faceCoverage = round(row.faceCoverage / row.count, 3)
      row.ready = row.count >= targetPerLabel && row.avgFrames >= minFrames
      delete row.frameTotal
    })

    const readyLabels = LABELS.filter((label) => perLabel[label]?.ready)
    const missingLabels = LABELS.filter((label) => !byLabel[label])
    const labelsBelowTarget = LABELS
      .filter((label) => (byLabel[label] || 0) > 0 && (byLabel[label] || 0) < targetPerLabel)
      .map((label) => ({ label, count: byLabel[label], missing: targetPerLabel - byLabel[label] }))

    const qualityWarnings = []
    if (missingLabels.length) qualityWarnings.push(`缺少类别: ${missingLabels.join(', ')}`)
    if (labelsBelowTarget.length) {
      qualityWarnings.push(`样本不足: ${labelsBelowTarget.map((item) => `${item.label} 还差 ${item.missing} 段`).join(', ')}`)
    }
    if (tooShortSamples.length) qualityWarnings.push(`${tooShortSamples.length} 段样本短于 ${minFrames} 帧`)
    LABELS.forEach((label) => {
      const row = perLabel[label]
      if (row?.count && row.avgFrames < IDEAL_MIN_AVG_FRAMES) {
        qualityWarnings.push(`${label} 平均只有 ${row.avgFrames} 帧，建议每段动作保持 1-3 秒`)
      }
    })

    const frameTotal = frameCounts.reduce((sum, value) => sum + value, 0)
    return {
      targetPerLabel,
      minValidFrames: minFrames,
      idealMinAvgFrames: IDEAL_MIN_AVG_FRAMES,
      totalSamples: samples.length,
      byLabel,
      perLabel,
      readyLabels,
      missingLabels,
      labelsBelowTarget,
      tooShortSamples,
      qualityWarnings,
      readyForTraining: readyLabels.length === LABELS.length && tooShortSamples.length === 0,
      frameStats: {
        min: frameCounts.length ? Math.min(...frameCounts) : 0,
        max: frameCounts.length ? Math.max(...frameCounts) : 0,
        avg: frameCounts.length ? round(frameTotal / frameCounts.length, 2) : 0,
      },
    }
  }

  class GestureDatasetRecorder {
    constructor({
      storageKey = 'aiOperaGestureDataset:v1',
      minFrameIntervalMs = 66,
      maxFramesPerSample = 180,
    } = {}) {
      this.storageKey = storageKey
      this.minFrameIntervalMs = minFrameIntervalMs
      this.maxFramesPerSample = maxFramesPerSample
      this.activeSample = null
      this.lastFrameAt = 0
      this.listeners = new Set()
      this.lastEvent = null
    }

    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      this.listeners.add(listener)
      listener(this.getState())
      return () => this.listeners.delete(listener)
    }

    notify() {
      const state = this.getState()
      this.listeners.forEach((listener) => listener(state))
    }

    getStoredSamples() {
      try {
        const raw = localStorage.getItem(this.storageKey)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed : []
      } catch (error) {
        return []
      }
    }

    saveStoredSamples(samples) {
      localStorage.setItem(this.storageKey, JSON.stringify(samples.slice(-500)))
    }

    getState() {
      const samples = this.getStoredSamples()
      const analysis = analyzeSamples(samples)
      return {
        active: !!this.activeSample,
        activeLabel: this.activeSample?.label || '',
        activeFrames: this.activeSample?.frames?.length || 0,
        labelCount: LABELS.length,
        standards: LABEL_STANDARDS,
        lastEvent: this.lastEvent,
        ...analysis,
      }
    }

    validateDataset() {
      return analyzeSamples(this.getStoredSamples())
    }

    start(label) {
      const safeLabel = String(label || 'idle').trim() || 'idle'
      this.lastEvent = {
        type: 'sample_started',
        label: safeLabel,
        standard: LABEL_STANDARDS[safeLabel] || null,
      }
      this.activeSample = {
        id: `gesture_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: safeLabel,
        startedAt: new Date().toISOString(),
        source: 'ai-opera-mediapipe-browser',
        fpsHint: Math.round(1000 / this.minFrameIntervalMs),
        frames: [],
      }
      this.lastFrameAt = 0
      this.notify()
      return this.activeSample
    }

    recordFrame({ faceLandmarks, handsResults, selectedHand, yaw = 0, pitch = 0, detector = null } = {}) {
      if (!this.activeSample) return false
      const now = performance.now()
      if (now - this.lastFrameAt < this.minFrameIntervalMs) return false
      this.lastFrameAt = now

      this.activeSample.frames.push({
        t: round(now - performance.timeOrigin, 3),
        faceBox: faceBox(faceLandmarks),
        faceAnchors: compactFaceAnchors(faceLandmarks),
        hands: compactHands(handsResults),
        selectedHand: selectedHand ? selectedHand.map(compactPoint) : [],
        yaw: round(yaw, 5),
        pitch: round(pitch, 5),
        detector: detector
          ? {
              triggered: !!detector.triggered,
              triggerType: detector.triggerType || '',
              direction: detector.direction || 0,
              state: detector.state || 0,
            }
          : null,
      })

      if (this.activeSample.frames.length >= this.maxFramesPerSample) {
        this.stop()
      } else {
        this.notify()
      }
      return true
    }

    stop() {
      if (!this.activeSample) return null
      const sample = {
        ...this.activeSample,
        endedAt: new Date().toISOString(),
        frameCount: this.activeSample.frames.length,
      }
      sample.quality = assessSample(sample)
      this.activeSample = null
      if (sample.frameCount >= 8) {
        const samples = this.getStoredSamples()
        const previousCount = samples.filter((item) => item.label === sample.label).length
        samples.push(sample)
        this.saveStoredSamples(samples)
        const labelCount = previousCount + 1
        const analysis = analyzeSamples(samples)
        this.lastEvent = {
          type: 'sample_saved',
          label: sample.label,
          frameCount: sample.frameCount,
          labelCount,
          targetPerLabel: TARGET_PER_LABEL,
          targetReached: previousCount < TARGET_PER_LABEL && labelCount >= TARGET_PER_LABEL,
          readyForTraining: analysis.readyForTraining,
          quality: sample.quality,
        }
      } else {
        this.lastEvent = {
          type: 'sample_discarded',
          label: sample.label,
          frameCount: sample.frameCount,
          minValidFrames: MIN_VALID_FRAMES,
          quality: sample.quality,
        }
      }
      this.notify()
      return sample
    }

    clear() {
      localStorage.removeItem(this.storageKey)
      this.activeSample = null
      this.lastEvent = { type: 'dataset_cleared' }
      this.notify()
    }

    exportDataset() {
      const samples = this.getStoredSamples()
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        schema: {
          labels: LABELS,
          standards: LABEL_STANDARDS,
          frame: 'faceBox + faceAnchors + hand landmarks + yaw/pitch + detector state',
        },
        quality: analyzeSamples(samples),
        samples,
      }
    }

    download(filename = '') {
      const dataset = this.exportDataset()
      const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || `ai-opera-gesture-dataset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    }

    downloadQualityReport(filename = '') {
      const report = {
        version: 1,
        exportedAt: new Date().toISOString(),
        sourceDatasetKey: this.storageKey,
        standards: LABEL_STANDARDS,
        quality: this.validateDataset(),
      }
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || `ai-opera-gesture-quality-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    }
  }

  window.AIOperaGestureDatasetRecorder = GestureDatasetRecorder
  window.AIOperaGestureDatasetLabels = LABELS
  window.AIOperaGestureDatasetStandards = LABEL_STANDARDS
})()
