(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function distance(a, b) {
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function faceMetrics(faceLandmarks) {
    if (!faceLandmarks || faceLandmarks.length < 468) return null
    const left = faceLandmarks[234]
    const right = faceLandmarks[454]
    const top = faceLandmarks[10]
    const bottom = faceLandmarks[152]
    if (!left || !right || !top || !bottom) return null

    const width = Math.max(0.001, Math.abs(right.x - left.x))
    const height = Math.max(0.001, Math.abs(bottom.y - top.y))
    return {
      cx: (left.x + right.x) / 2,
      cy: (top.y + bottom.y) / 2,
      width,
      height,
    }
  }

  function handAnchor(handLandmarks) {
    if (!handLandmarks || handLandmarks.length < 21) return null
    const indices = [0, 5, 9, 13, 17]
    const points = indices.map((index) => handLandmarks[index]).filter(Boolean)
    if (!points.length) return null
    return points.reduce(
      (acc, point, index) => {
        acc.x = (acc.x * index + point.x) / (index + 1)
        acc.y = (acc.y * index + point.y) / (index + 1)
        return acc
      },
      { x: 0, y: 0 },
    )
  }

  class TemporalGestureRecognizer {
    constructor({
      windowMs = 900,
      maxFrames = 45,
      confidenceThreshold = 0.88,
      cooldownFrames = 18,
      sampleStorageKey = 'aiOperaGestureSamples:v1',
    } = {}) {
      this.windowMs = windowMs
      this.maxFrames = maxFrames
      this.confidenceThreshold = confidenceThreshold
      this.cooldownFrames = cooldownFrames
      this.sampleStorageKey = sampleStorageKey
      this.buffer = []
      this.cooldown = 0
      this.lastResult = null
    }

    update({ faceLandmarks, handLandmarks, yaw = 0, pitch = 0, faceRegion = null } = {}) {
      const face = faceRegion
        ? {
            cx: faceRegion.center.x,
            cy: faceRegion.center.y,
            width: Math.max(0.001, faceRegion.width),
            height: Math.max(0.001, faceRegion.height),
          }
        : faceMetrics(faceLandmarks)
      if (!face) return { triggered: false, confidence: 0, triggerType: null }

      const hand = handAnchor(handLandmarks)
      const t = performance.now()
      const sample = {
        t,
        handX: hand ? (hand.x - face.cx) / face.width : null,
        handY: hand ? (hand.y - face.cy) / face.height : null,
        handDistance: hand ? distance(hand, { x: face.cx, y: face.cy }) / Math.max(face.width, face.height) : null,
        yawDeg: yaw * 180 / Math.PI,
        pitchDeg: pitch,
      }
      this.buffer.push(sample)
      this.buffer = this.buffer
        .filter((item) => t - item.t <= this.windowMs)
        .slice(-this.maxFrames)

      if (this.cooldown > 0) {
        this.cooldown -= 1
        return { triggered: false, confidence: 0, triggerType: null }
      }

      const result = this.classify()
      this.lastResult = result
      if (result.triggered) {
        this.cooldown = this.cooldownFrames
      }
      return result
    }

    classify() {
      const handFrames = this.buffer.filter((item) => item.handX !== null && item.handY !== null)
      const poseFrames = this.buffer.filter((item) => Number.isFinite(item.yawDeg) && Number.isFinite(item.pitchDeg))

      const handResult = this.classifyHandSequence(handFrames)
      if (handResult.triggered) return handResult

      const poseResult = this.classifyPoseSequence(poseFrames)
      if (poseResult.triggered) return poseResult

      return { triggered: false, confidence: 0, triggerType: null }
    }

    classifyHandSequence(frames) {
      if (frames.length < 8) return { triggered: false, confidence: 0, triggerType: null }
      const start = frames[0]
      const end = frames[frames.length - 1]
      const dx = end.handX - start.handX
      const dy = end.handY - start.handY
      const nearFaceCount = frames.filter((item) => item.handDistance !== null && item.handDistance < 1.05).length
      const nearRatio = nearFaceCount / frames.length
      const travel = Math.hypot(dx, dy)
      const horizontalDominance = Math.abs(dx) / Math.max(travel, 0.001)
      const verticalDominance = Math.abs(dy) / Math.max(travel, 0.001)
      const speedScore = clamp(travel / 1.1, 0, 1)
      const contactScore = clamp((nearRatio - 0.32) / 0.5, 0, 1)

      if (Math.abs(dx) > 0.62 && horizontalDominance > 0.68 && nearRatio > 0.34) {
        return {
          triggered: true,
          confidence: clamp(0.45 + speedScore * 0.34 + contactScore * 0.28, 0, 0.99),
          triggerType: 'temporal_horizontal_swipe',
          direction: dx > 0 ? 'left_to_right' : 'right_to_left',
        }
      }

      if (Math.abs(dy) > 0.55 && verticalDominance > 0.68 && nearRatio > 0.34) {
        return {
          triggered: true,
          confidence: clamp(0.45 + speedScore * 0.34 + contactScore * 0.28, 0, 0.99),
          triggerType: 'temporal_vertical_swipe',
          direction: dy > 0 ? 'top_to_bottom' : 'bottom_to_top',
        }
      }

      return { triggered: false, confidence: 0, triggerType: null }
    }

    classifyPoseSequence(frames) {
      if (frames.length < 10) return { triggered: false, confidence: 0, triggerType: null }
      const yaws = frames.map((item) => item.yawDeg)
      const pitches = frames.map((item) => item.pitchDeg)
      const yawRange = Math.max(...yaws) - Math.min(...yaws)
      const pitchRange = Math.max(...pitches) - Math.min(...pitches)
      let yawTurns = 0
      let previousDirection = 0
      for (let i = 1; i < yaws.length; i += 1) {
        const delta = yaws[i] - yaws[i - 1]
        if (Math.abs(delta) < 1.2) continue
        const direction = delta > 0 ? 1 : -1
        if (previousDirection && direction !== previousDirection) yawTurns += 1
        previousDirection = direction
      }

      const maxAbsYaw = Math.max(...yaws.map((value) => Math.abs(value)))
      const lastYaw = yaws[yaws.length - 1]
      const turnedSide = yaws.find((value) => Math.abs(value) > 16)
      const turnedFrames = yaws.filter((value) => Math.abs(value) > 16).length
      if (maxAbsYaw > 16 && turnedFrames >= 3 && Math.abs(lastYaw) < 5 && Number.isFinite(turnedSide)) {
        return {
          triggered: true,
          confidence: clamp(0.58 + maxAbsYaw / 42 + yawTurns * 0.04, 0, 0.98),
          triggerType: 'temporal_head_return',
        }
      }

      return { triggered: false, confidence: 0, triggerType: null }
    }

    shouldCommit(result) {
      return !!(result && result.triggered && result.confidence >= this.confidenceThreshold)
    }

    recordSample(label) {
      const sample = {
        label,
        capturedAt: new Date().toISOString(),
        frames: this.buffer.slice(),
      }
      const samples = this.loadSamples()
      samples.push(sample)
      localStorage.setItem(this.sampleStorageKey, JSON.stringify(samples.slice(-200)))
      return sample
    }

    loadSamples() {
      try {
        const raw = localStorage.getItem(this.sampleStorageKey)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed : []
      } catch (error) {
        return []
      }
    }

    exportSamples() {
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        samples: this.loadSamples(),
      }
    }
  }

  window.TemporalGestureRecognizer = TemporalGestureRecognizer
})()
