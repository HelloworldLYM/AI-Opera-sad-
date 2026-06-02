/**
 * 川剧变脸 - 手势检测模块 (完整版)
 *
 * 功能：
 * - 手横向拂过面部（从左到右 / 从右到左）
 * - 手纵向拂过面部（从上到下 / 从下到上）
 * - 快速左右摇头检测（yaw角速度）
 * - 输出触发信号 + 触发类型用于变脸动画
 *
 * 使用方式：
 *   const detector = new HandFaceSwipeDetector();
 *   detector.update(faceLandmarks, handLandmarks, yawAngle);
 *   if (detector.triggered) {
 *     switch (detector.triggerType) {
 *       case 'horizontal_swipe':  // 水平滑动手势
 *       case 'vertical_swipe':    // 垂直滑动手势
 *       case 'head_shake':        // 摇头手势
 *     }
 *   }
 */

class SwipeState {
  static IDLE = 0
  static ENTERING = 1
  static CROSSING = 2
  static EXITING = 3
  static TRIGGERED = 4
}

class SwipeDirection {
  static NONE = 0
  static LEFT_TO_RIGHT = 1
  static RIGHT_TO_LEFT = 2
  static TOP_TO_BOTTOM = 3
  static BOTTOM_TO_TOP = 4
}

/**
 * 一维卡尔曼滤波器
 */
class KalmanFilter1D {
  constructor(processNoise = 1e-4, measurementNoise = 1e-2) {
    this.x = 0
    this.P = 1.0
    this.Q = processNoise
    this.R = measurementNoise
    this.initialized = false
  }

  update(measurement) {
    if (!this.initialized) {
      this.x = measurement
      this.initialized = true
      return measurement
    }
    const P_pred = this.P + this.Q
    const K = P_pred / (P_pred + this.R)
    this.x = this.x + K * (measurement - this.x)
    this.P = (1 - K) * P_pred
    return this.x
  }
}

/**
 * 川剧变脸 - 手势检测器
 */
class HandFaceSwipeDetector {
  constructor() {
    // ======================== 面部区域配置 ========================
    this.FACE_BBOX_EXPAND = 1.4

    // 面部轮廓点索引（MediaPipe 468点）
    this.FACE_CONTOUR_INDICES = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
      397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
      172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10
    ]

    // 手部关键点索引
    this.WRIST = 0
    this.MIDDLE_MCP = 9

    // ======================== 手部滑动检测配置 ========================
    // 速度阈值（归一化坐标/帧）
    this.MIN_SWIPE_SPEED = 0.0018
    this.MAX_SWIPE_SPEED = 0.35
    this.CROSSING_THRESHOLD = 0.11
    // 方向容忍度（>0.5 表示该方向占主导）
    this.DIRECTION_TOLERANCE = 0.25
    this.TRAJECTORY_LENGTH = 100
    this.SWIPE_COMMIT_RATIO = 0.025
    this.ENTERING_TIMEOUT_FRAMES = 78
    this.CROSSING_STALL_FRAMES = 34
    this.HAND_INTERACTION_INDICES = [0, 5, 9, 13, 17, 8, 12]
    this.PALM_INTERACTION_INDICES = [0, 5, 9, 13, 17]
    this.OPEN_HAND_REQUIRED_FINGERS = 1
    this.OPEN_HAND_MARGIN = 0.008
    this.OPEN_HAND_DISTANCE_RATIO = 1.08
    this.OPEN_HAND_SPREAD_RATIO = 0.48
    this.SWIPE_EXIT_GRACE_FRAMES = 15
    this.SWIPE_PRE_ROLL_FRAMES = 7

    // ======================== 摇头检测配置 ========================
    // 摇头角度阈值（度）
    this.HEAD_SHAKE_ANGLE_THRESHOLD = 15
    // 摇头时间窗口（帧数，约30fps下 = 0.4秒）
    this.HEAD_SHAKE_WINDOW_FRAMES = 12
    // 摇头最小次数
    this.HEAD_SHAKE_MIN_TURNS = 2
    // 摇头最小角速度（度/帧）
    this.HEAD_SHAKE_MIN_VELOCITY = 2.0
    // Yaw历史记录
    this.yawHistory = []
    this.yawHistoryLength = this.HEAD_SHAKE_WINDOW_FRAMES
    this.HEAD_RETURN_OUT_THRESHOLD = 16
    this.HEAD_RETURN_CENTER_THRESHOLD = 5
    this.HEAD_RETURN_MAX_FRAMES = 64
    this.HEAD_RETURN_MIN_HOLD_FRAMES = 5
    this.headReturnState = 'center'
    this.headReturnSide = 0
    this.headReturnStartFrame = 0
    this.headReturnPeak = 0
    this.smoothedYawDeg = null
    this.YAW_RETURN_SMOOTHING = 0.5

    // ======================== 点头检测配置 ========================
    // 点头角度阈值（度）- 向上/向下转动的最小角度
    this.ENABLE_HEAD_NOD_SWITCH = false
    this.HEAD_NOD_ANGLE_THRESHOLD = 6
    // 点头时间窗口（帧数）
    this.HEAD_NOD_WINDOW_FRAMES = 20
    // 回正角度阈值（度）- 判断是否回到正向（相对于初始位置）
    this.HEAD_NOD_RETURN_THRESHOLD = 2.5
    // Pitch历史记录
    this.pitchHistory = []
    this.pitchHistoryLength = this.HEAD_NOD_WINDOW_FRAMES
    // 点头状态追踪
    this.nodState = 'neutral'  // 'neutral', 'tilted_up', 'tilted_down'
    this.nodStartPitch = 0
    this.baselinePitch = null  // 基准姿态
    this.baselineFrames = 0    // 用于计算基准的帧数

    // ======================== 状态 ========================
    this.state = SwipeState.IDLE
    this.direction = SwipeDirection.NONE
    this.triggered = false
    this.triggerType = null  // 'horizontal_swipe' | 'vertical_swipe' | 'head_shake'

    // 卡尔曼滤波器
    this.kalmanX = new KalmanFilter1D()
    this.kalmanY = new KalmanFilter1D()

    // 轨迹历史
    this.trajectory = []
    this.frameCount = 0
    this.enteringFrame = 0
    this.lastSwipeTouchFrame = 0
    this.totalSwipes = 0

    // ======================== 脸谱数据集路径配置 ========================
    // ⚠️ 待替换：将脸谱GLB文件放入此目录后，修改此路径
    this.FACE_MASK_DATASET_PATH = '../public/face_masks/masks/'
    // 当前加载的面具文件名
    this.currentMaskFile = '444.glb'
    // 面具切换动画状态
    this.isSwitchingMask = false
    this.maskSwitchCooldown = 0  // 冷却时间（帧）
    this.MASK_SWITCH_COOLDOWN_FRAMES = 10
    this.temporalRecognizer =
      typeof window !== 'undefined' && window.TemporalGestureRecognizer
        ? new window.TemporalGestureRecognizer({ confidenceThreshold: 0.78, cooldownFrames: 14 })
        : null
  }

  /**
   * 从 Face Mesh 468点提取面部区域
   */
  detectFaceRegion(faceLandmarks) {
    if (!faceLandmarks || faceLandmarks.length < 468) return null

    const xs = faceLandmarks.map(lm => lm.x)
    const ys = faceLandmarks.map(lm => lm.y)

    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const yMin = Math.min(...ys)
    const yMax = Math.max(...ys)

    const cx = (xMin + xMax) / 2
    const cy = (yMin + yMax) / 2
    const w = xMax - xMin
    const h = yMax - yMin

    const expandW = w * (this.FACE_BBOX_EXPAND - 1) / 2
    const expandH = h * (this.FACE_BBOX_EXPAND - 1) / 2

    return {
      bbox: {
        xMin: Math.max(0, xMin - expandW),
        yMin: Math.max(0, yMin - expandH),
        xMax: Math.min(1, xMax + expandW),
        yMax: Math.min(1, yMax + expandH)
      },
      center: { x: cx, y: cy },
      width: w,
      height: h,
      contour: this.FACE_CONTOUR_INDICES.map(i => faceLandmarks[i]),
      noseTip: { x: faceLandmarks[1].x, y: faceLandmarks[1].y }
    }
  }

  /**
   * 获取手部锚点（手掌中心）
   */
  getHandAnchor(handLandmarks) {
    if (!handLandmarks || handLandmarks.length < 21) return null

    const palmIndices = [0, 5, 9, 13, 17]
    const palmPoints = palmIndices.map((index) => handLandmarks[index]).filter(Boolean)
    if (palmPoints.length === 0) return null

    const sum = palmPoints.reduce((acc, point) => {
      acc.x += point.x
      acc.y += point.y
      return acc
    }, { x: 0, y: 0 })

    return {
      x: sum.x / palmPoints.length,
      y: sum.y / palmPoints.length
    }
  }

  getSwipeAnchor(handLandmarks) {
    const palmAnchor = this.getHandAnchor(handLandmarks)
    if (!palmAnchor || !handLandmarks || handLandmarks.length < 21) return palmAnchor

    const indexTip = handLandmarks[8]
    const middleTip = handLandmarks[12]
    if (!indexTip || !middleTip) return palmAnchor

    const tipCenter = {
      x: (indexTip.x + middleTip.x) / 2,
      y: (indexTip.y + middleTip.y) / 2,
    }

    return {
      x: palmAnchor.x * 0.62 + tipCenter.x * 0.38,
      y: palmAnchor.y * 0.62 + tipCenter.y * 0.38,
    }
  }

  distanceBetween(a, b) {
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  isOpenHand(handLandmarks) {
    if (!handLandmarks || handLandmarks.length < 21) return false

    const wrist = handLandmarks[0]
    const fingerTriples = [
      [8, 6, 5],
      [12, 10, 9],
      [16, 14, 13],
      [20, 18, 17],
    ]

    let extended = 0
    for (const [tipIndex, pipIndex, mcpIndex] of fingerTriples) {
      const tip = handLandmarks[tipIndex]
      const pip = handLandmarks[pipIndex]
      const mcp = handLandmarks[mcpIndex]
      if (!tip || !pip || !mcp || !wrist) continue

      const verticalExtended = tip.y < pip.y - this.OPEN_HAND_MARGIN
      const wristToTip = this.distanceBetween(wrist, tip)
      const wristToPip = this.distanceBetween(wrist, pip)
      const mcpToTip = this.distanceBetween(mcp, tip)
      const mcpToPip = this.distanceBetween(mcp, pip)
      const distanceExtended =
        wristToTip > wristToPip * this.OPEN_HAND_DISTANCE_RATIO &&
        mcpToTip > mcpToPip * 1.18

      if (verticalExtended || distanceExtended) {
        extended++
      }
    }

    const palmWidth = this.distanceBetween(handLandmarks[5], handLandmarks[17])
    const fingertipIndices = [8, 12, 16, 20]
    let maxTipSeparation = 0
    for (let i = 0; i < fingertipIndices.length; i++) {
      for (let j = i + 1; j < fingertipIndices.length; j++) {
        maxTipSeparation = Math.max(
          maxTipSeparation,
          this.distanceBetween(handLandmarks[fingertipIndices[i]], handLandmarks[fingertipIndices[j]])
        )
      }
    }

    const spreadOk = palmWidth > 0 && maxTipSeparation > palmWidth * this.OPEN_HAND_SPREAD_RATIO
    return extended >= this.OPEN_HAND_REQUIRED_FINGERS && spreadOk
  }

  isClosedFist(handLandmarks) {
    if (!handLandmarks || handLandmarks.length < 21) return false

    const wrist = handLandmarks[0]
    const fingerPairs = [
      [8, 6],
      [12, 10],
      [16, 14],
      [20, 18],
    ]

    let curled = 0
    for (const [tipIndex, pipIndex] of fingerPairs) {
      const tip = handLandmarks[tipIndex]
      const pip = handLandmarks[pipIndex]
      if (!tip || !pip || !wrist) continue

      const tipNearerWrist = this.distanceBetween(wrist, tip) <= this.distanceBetween(wrist, pip) * 1.08
      const tipBelowJoint = tip.y > pip.y - this.OPEN_HAND_MARGIN
      if (tipNearerWrist || tipBelowJoint) curled++
    }

    const palmWidth = this.distanceBetween(handLandmarks[5], handLandmarks[17])
    const tipSpread = Math.max(
      this.distanceBetween(handLandmarks[8], handLandmarks[12]),
      this.distanceBetween(handLandmarks[12], handLandmarks[16]),
      this.distanceBetween(handLandmarks[16], handLandmarks[20])
    )
    const compact = palmWidth > 0 && tipSpread < palmWidth * 1.18

    return curled >= 4 && compact
  }

  isSwipeHand(handLandmarks) {
    if (!handLandmarks || handLandmarks.length < 21) return false
    if (this.isOpenHand(handLandmarks)) return true
    if (this.isClosedFist(handLandmarks)) return false

    const palmWidth = this.distanceBetween(handLandmarks[5], handLandmarks[17])
    if (palmWidth <= 0) return false

    const indexReach =
      this.distanceBetween(handLandmarks[0], handLandmarks[8]) >
      this.distanceBetween(handLandmarks[0], handLandmarks[6]) * 1.02
    const middleReach =
      this.distanceBetween(handLandmarks[0], handLandmarks[12]) >
      this.distanceBetween(handLandmarks[0], handLandmarks[10]) * 1.02
    const tipSpread = Math.max(
      this.distanceBetween(handLandmarks[8], handLandmarks[12]),
      this.distanceBetween(handLandmarks[8], handLandmarks[20]),
      this.distanceBetween(handLandmarks[12], handLandmarks[20])
    )

    return indexReach || middleReach || tipSpread > palmWidth * 0.32
  }

  getSwipeActiveRegion(faceRegion) {
    if (!faceRegion) return null

    const { center, width, height } = faceRegion
    return {
      xMin: Math.max(0, center.x - width * 0.95),
      xMax: Math.min(1, center.x + width * 0.95),
      yMin: Math.max(0, center.y - height * 0.58),
      yMax: Math.min(1, center.y + height * 0.5),
    }
  }

  getSwipeProbePoints(handLandmarks) {
    if (!handLandmarks || handLandmarks.length < 21) return []

    const swipeAnchor = this.getSwipeAnchor(handLandmarks)
    const probeIndices = [0, 5, 9, 8, 12]
    const probePoints = probeIndices.map((index) => handLandmarks[index]).filter(Boolean)

    return swipeAnchor ? [swipeAnchor, ...probePoints] : probePoints
  }

  isHandNearFaceBox(handLandmarks, faceRegion) {
    if (!handLandmarks || !faceRegion) return false

    const anchor = this.getHandAnchor(handLandmarks)
    if (!anchor) return false

    const marginX = faceRegion.width * 0.18
    const marginY = faceRegion.height * 0.24
    const nearBox = {
      xMin: Math.max(0, faceRegion.bbox.xMin - marginX),
      xMax: Math.min(1, faceRegion.bbox.xMax + marginX),
      yMin: Math.max(0, faceRegion.bbox.yMin - marginY),
      yMax: Math.min(1, faceRegion.bbox.yMax + marginY),
    }

    const anchorNearFace =
      anchor.x >= nearBox.xMin &&
      anchor.x <= nearBox.xMax &&
      anchor.y >= nearBox.yMin &&
      anchor.y <= nearBox.yMax

    if (anchorNearFace) return true

    return this.PALM_INTERACTION_INDICES.some((index) => {
      const point = handLandmarks[index]
      if (!point) return false
      return (
        point.x >= nearBox.xMin &&
        point.x <= nearBox.xMax &&
        point.y >= nearBox.yMin &&
        point.y <= nearBox.yMax
      )
    })
  }

  isHandTouchingFace(handLandmarks, faceRegion) {
    if (!handLandmarks || !faceRegion || !this.isSwipeHand(handLandmarks)) return false

    const activeRegion = this.getSwipeActiveRegion(faceRegion)
    const probePoints = this.getSwipeProbePoints(handLandmarks)
    if (!activeRegion || probePoints.length === 0) return false

    const contactCount = probePoints.reduce((count, point) => {
      const inRegion =
        point.x >= activeRegion.xMin &&
        point.x <= activeRegion.xMax &&
        point.y >= activeRegion.yMin &&
        point.y <= activeRegion.yMax
      return count + (inRegion ? 1 : 0)
    }, 0)

    return contactCount >= 1
  }

  startCooldown(frames = this.MASK_SWITCH_COOLDOWN_FRAMES) {
    this.maskSwitchCooldown = Math.max(this.maskSwitchCooldown, frames)
  }

  resetGestureTracking() {
    this.state = SwipeState.IDLE
    this.direction = SwipeDirection.NONE
    this.triggerType = null
    this.trajectory = []
    this.yawHistory = []
    this.lastSwipeTouchFrame = 0
    if (this.triggered || this.maskSwitchCooldown > 0) this.resetHeadReturnTracking()
  }

  resetHeadReturnTracking() {
    this.headReturnState = 'center'
    this.headReturnSide = 0
    this.headReturnStartFrame = this.frameCount
    this.headReturnPeak = 0
    this.smoothedYawDeg = null
  }

  commitTrigger() {
    this.state = SwipeState.TRIGGERED
    this.triggered = true
    this.totalSwipes++
    this.startCooldown()
    const dirText = this.getDirectionText()
    console.log(`[触发 #${this.totalSwipes}] 类型=${this.triggerType}, 方向=${dirText}`)
  }

  applyTemporalDirection(result) {
    switch (result?.direction) {
      case 'left_to_right':
        this.direction = SwipeDirection.LEFT_TO_RIGHT
        break
      case 'right_to_left':
        this.direction = SwipeDirection.RIGHT_TO_LEFT
        break
      case 'top_to_bottom':
        this.direction = SwipeDirection.TOP_TO_BOTTOM
        break
      case 'bottom_to_top':
        this.direction = SwipeDirection.BOTTOM_TO_TOP
        break
      default:
        break
    }
  }

  hasCommittedCrossing(handPos, faceRegion) {
    const offsetX = faceRegion.width * this.SWIPE_COMMIT_RATIO
    const offsetY = faceRegion.height * this.SWIPE_COMMIT_RATIO

    switch (this.direction) {
      case SwipeDirection.LEFT_TO_RIGHT:
        return handPos.x >= faceRegion.center.x + offsetX
      case SwipeDirection.RIGHT_TO_LEFT:
        return handPos.x <= faceRegion.center.x - offsetX
      case SwipeDirection.TOP_TO_BOTTOM:
        return handPos.y >= faceRegion.center.y + offsetY
      case SwipeDirection.BOTTOM_TO_TOP:
        return handPos.y <= faceRegion.center.y - offsetY
      default:
        return false
    }
  }

  /**
   * PNPoly 算法 - 判断点是否在多边形内
   */
  pointInPolygon(point, polygon) {
    const { x, y } = point
    let inside = false

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y
      const xj = polygon[j].x, yj = polygon[j].y

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)

      if (intersect) inside = !inside
    }

    return inside
  }

  /**
   * 计算手部速度
   */
  calculateVelocity() {
    if (this.trajectory.length < 2) {
      return { vx: 0, vy: 0, speed: 0 }
    }

    const current = this.trajectory[this.trajectory.length - 1]
    const previous = this.trajectory[this.trajectory.length - 2]

    const vx = current.x - previous.x
    const vy = current.y - previous.y
    const speed = Math.sqrt(vx * vx + vy * vy)

    return { vx, vy, speed }
  }

  /**
   * 检查是否发生横向穿过（左右滑动）
   */
  checkHorizontalCrossing(faceRegion) {
    if (this.trajectory.length < 3) return false

    const faceWidth = faceRegion.width
    const framesSinceEnter = this.frameCount - this.enteringFrame
    if (framesSinceEnter < 2) return false

    const startIdx = Math.max(0, this.trajectory.length - framesSinceEnter)
    const crossingTrajectory = this.trajectory.slice(startIdx)
    if (crossingTrajectory.length < 2) return false

    // 计算平均速度
    const totalDistance = crossingTrajectory.reduce((sum, pt, idx, arr) => {
      if (idx === 0) return 0
      const dx = pt.x - arr[idx - 1].x
      const dy = pt.y - arr[idx - 1].y
      return sum + Math.sqrt(dx * dx + dy * dy)
    }, 0)
    const avgSpeed = totalDistance / crossingTrajectory.length

    // 速度不够快，不触发
    if (avgSpeed < this.MIN_SWIPE_SPEED) return false

    const firstX = crossingTrajectory[0].x
    const lastX = crossingTrajectory[crossingTrajectory.length - 1].x
    const dx = lastX - firstX
    const threshold = faceWidth * this.CROSSING_THRESHOLD

    if (Math.abs(dx) < threshold) return false

    // 验证水平方向占主导
    const dy = crossingTrajectory[crossingTrajectory.length - 1].y - crossingTrajectory[0].y
    const totalTravel = Math.sqrt(dx * dx + dy * dy)

    if (totalTravel > 0) {
      const horizontalRatio = Math.abs(dx) / totalTravel
      if (horizontalRatio < this.DIRECTION_TOLERANCE) return false
    }

    this.direction = dx > 0 ? SwipeDirection.LEFT_TO_RIGHT : SwipeDirection.RIGHT_TO_LEFT
    this.triggerType = 'horizontal_swipe'
    return true
  }

  /**
   * 检查是否发生纵向穿过（上下滑动）
   */
  checkVerticalCrossing(faceRegion) {
    if (this.trajectory.length < 3) return false

    const faceHeight = faceRegion.height
    const framesSinceEnter = this.frameCount - this.enteringFrame
    if (framesSinceEnter < 2) return false

    const startIdx = Math.max(0, this.trajectory.length - framesSinceEnter)
    const crossingTrajectory = this.trajectory.slice(startIdx)
    if (crossingTrajectory.length < 2) return false

    // 计算平均速度
    const totalDistance = crossingTrajectory.reduce((sum, pt, idx, arr) => {
      if (idx === 0) return 0
      const dx = pt.x - arr[idx - 1].x
      const dy = pt.y - arr[idx - 1].y
      return sum + Math.sqrt(dx * dx + dy * dy)
    }, 0)
    const avgSpeed = totalDistance / crossingTrajectory.length

    // 速度不够快，不触发
    if (avgSpeed < this.MIN_SWIPE_SPEED) return false

    const firstY = crossingTrajectory[0].y
    const lastY = crossingTrajectory[crossingTrajectory.length - 1].y
    const dy = lastY - firstY
    const threshold = faceHeight * this.CROSSING_THRESHOLD

    if (Math.abs(dy) < threshold) return false

    // 验证垂直方向占主导
    const dx = crossingTrajectory[crossingTrajectory.length - 1].x - crossingTrajectory[0].x
    const totalTravel = Math.sqrt(dx * dx + dy * dy)

    if (totalTravel > 0) {
      const verticalRatio = Math.abs(dy) / totalTravel
      if (verticalRatio < this.DIRECTION_TOLERANCE) return false
    }

    this.direction = dy > 0 ? SwipeDirection.TOP_TO_BOTTOM : SwipeDirection.BOTTOM_TO_TOP
    this.triggerType = 'vertical_swipe'
    return true
  }

  /**
   * 检测快速左右摇头（基于 yaw 角速度）
   * @param {number} yaw - 当前帧 yaw 角（弧度）
   * @returns {boolean} 是否触发摇头
   */
  detectHeadShake(yaw) {
    if (yaw === undefined || isNaN(yaw)) return false

    const rawYawDeg = yaw * 180 / Math.PI
    const yawDeg = this.smoothedYawDeg === null
      ? rawYawDeg
      : this.smoothedYawDeg * this.YAW_RETURN_SMOOTHING + rawYawDeg * (1 - this.YAW_RETURN_SMOOTHING)
    this.smoothedYawDeg = yawDeg
    const absYaw = Math.abs(yawDeg)
    const side = yawDeg >= 0 ? 1 : -1

    if (this.headReturnState === 'center') {
      if (absYaw >= this.HEAD_RETURN_OUT_THRESHOLD) {
        this.headReturnState = 'turned'
        this.headReturnSide = side
        this.headReturnStartFrame = this.frameCount
        this.headReturnPeak = absYaw
      }
      return false
    }

    if (this.headReturnState === 'turned') {
      this.headReturnPeak = Math.max(this.headReturnPeak, absYaw)
      if (side !== this.headReturnSide && absYaw >= this.HEAD_RETURN_OUT_THRESHOLD) {
        this.headReturnSide = side
        this.headReturnStartFrame = this.frameCount
        this.headReturnPeak = absYaw
        return false
      }

      const elapsed = this.frameCount - this.headReturnStartFrame
      if (elapsed > this.HEAD_RETURN_MAX_FRAMES) {
        this.resetHeadReturnTracking()
        return false
      }

      if (
        absYaw <= this.HEAD_RETURN_CENTER_THRESHOLD &&
        this.headReturnPeak >= this.HEAD_RETURN_OUT_THRESHOLD &&
        elapsed >= this.HEAD_RETURN_MIN_HOLD_FRAMES
      ) {
        this.direction = this.headReturnSide > 0
          ? SwipeDirection.LEFT_TO_RIGHT
          : SwipeDirection.RIGHT_TO_LEFT
        this.triggerType = 'head_return'
        this.resetHeadReturnTracking()
        return true
      }

      return false
    }

    this.yawHistory.push(yawDeg)
    if (this.yawHistory.length > this.yawHistoryLength) {
      this.yawHistory.shift()
    }

    if (this.yawHistory.length < 6) return false

    let directionChanges = 0
    let prevDir = null

    for (let i = 1; i < this.yawHistory.length; i++) {
      const diff = this.yawHistory[i] - this.yawHistory[i - 1]
      if (Math.abs(diff) < 1.5) continue
      const currentDir = diff > 0 ? 1 : -1
      if (prevDir !== null && currentDir !== prevDir) {
        directionChanges++
      }
      if (prevDir === null || currentDir !== prevDir) {
        prevDir = currentDir
      }
    }

    const minYaw = Math.min(...this.yawHistory)
    const maxYaw = Math.max(...this.yawHistory)
    const totalRange = maxYaw - minYaw

    if (directionChanges >= this.HEAD_SHAKE_MIN_TURNS && totalRange > this.HEAD_SHAKE_ANGLE_THRESHOLD * 2) {
      const totalYawChange = this.yawHistory.reduce((sum, val, idx, arr) => {
        if (idx === 0) return 0
        return sum + Math.abs(val - arr[idx - 1])
      }, 0)
      const avgAngularVelocity = totalYawChange / this.yawHistory.length

      if (avgAngularVelocity > this.HEAD_SHAKE_MIN_VELOCITY) {
        this.direction = this.yawHistory[this.yawHistory.length - 1] > this.yawHistory[0]
          ? SwipeDirection.LEFT_TO_RIGHT
          : SwipeDirection.RIGHT_TO_LEFT
        this.triggerType = 'head_shake'
        return true
      }
    }

    return false
  }

  /**
   * 检测抬头/低头后回正（类似摇头逻辑）
   * @param {number} pitch - 当前帧 pitch 角（已经是角度，不是弧度）
   * @returns {boolean} 是否触发点头
   */
  detectHeadNod(pitch) {
    if (pitch === undefined || isNaN(pitch)) return false

    const pitchDeg = pitch

    // 初始化基准姿态（前30帧的平均值）
    if (this.baselineFrames < 30) {
      if (this.baselinePitch === null) {
        this.baselinePitch = pitchDeg
      } else {
        this.baselinePitch = (this.baselinePitch * this.baselineFrames + pitchDeg) / (this.baselineFrames + 1)
      }
      this.baselineFrames++
      return false
    }

    // 计算相对于基准的偏移
    const relativePitch = pitchDeg - this.baselinePitch

    // 调试输出
    if (this.frameCount % 30 === 0) {
      console.log(`[点头检测] pitch=${pitchDeg.toFixed(1)}°, 基准=${this.baselinePitch.toFixed(1)}°, 相对=${relativePitch.toFixed(1)}°, 状态=${this.nodState}`)
    }

    // 状态机：neutral → triggered (只触发一次)
    switch (this.nodState) {
      case 'neutral':
        // 检测是否抬头/低头超过阈值（相对于基准）
        if (relativePitch > this.HEAD_NOD_ANGLE_THRESHOLD) {
          console.log(`[点头检测] 检测到低头: 相对${relativePitch.toFixed(1)}° → 触发换脸！`)
          this.nodState = 'triggered'
          this.direction = SwipeDirection.TOP_TO_BOTTOM
          this.triggerType = 'head_nod'
          return true
        } else if (relativePitch < -this.HEAD_NOD_ANGLE_THRESHOLD) {
          console.log(`[点头检测] 检测到抬头: 相对${relativePitch.toFixed(1)}° → 触发换脸！`)
          this.nodState = 'triggered'
          this.direction = SwipeDirection.BOTTOM_TO_TOP
          this.triggerType = 'head_nod'
          return true
        }
        break

      case 'triggered':
        // 等待回到基准位置附近才能再次触发
        if (Math.abs(relativePitch) < this.HEAD_NOD_RETURN_THRESHOLD) {
          console.log(`[点头检测] 回到基准位置，重置状态`)
          this.nodState = 'neutral'
        }
        break
    }

    return false
  }

  /**
   * 更新检测器状态（每帧调用）
   * @param {Array} faceLandmarks - MediaPipe Face Mesh 468个关键点
   * @param {Array} handLandmarks - MediaPipe Hands 21个关键点（可选）
   * @param {number} yaw - 当前帧 yaw 角（弧度），用于摇头检测
   * @param {number} pitch - 当前帧 pitch 角（弧度），用于点头检测
   */
  update(faceLandmarks, handLandmarks = null, yaw = 0, pitch = 0) {
    this.frameCount++
    this.triggered = false

    if (this.frameCount % 30 === 0) {
      console.log(`[update] state=${this.state}, cooldown=${this.maskSwitchCooldown}, pitch=${pitch}`)
    }

    const faceRegion = this.detectFaceRegion(faceLandmarks)
    if (!faceRegion) return this.state
    const handTouchingFace = !!(handLandmarks && this.isHandTouchingFace(handLandmarks, faceRegion))
    const handNearFace = !!(handLandmarks && this.isHandNearFaceBox(handLandmarks, faceRegion))

    if (this.maskSwitchCooldown > 0) {
      this.maskSwitchCooldown--
      this.resetGestureTracking()
      return this.state
    }

    const temporalResult = this.temporalRecognizer?.update({
      faceLandmarks,
      handLandmarks,
      yaw,
      pitch,
      faceRegion,
    })
    const temporalTriggerType = String(temporalResult?.triggerType || '')
    const temporalIsPose = temporalTriggerType.includes('head_')
    const temporalPoseAllowed = temporalTriggerType === 'temporal_head_return' || temporalTriggerType === 'head_return'
    if (
      this.state === SwipeState.IDLE &&
      this.temporalRecognizer?.shouldCommit(temporalResult) &&
      (!temporalIsPose || (temporalPoseAllowed && !handNearFace))
    ) {
      this.triggerType = temporalResult.triggerType
      this.applyTemporalDirection(temporalResult)
      this.commitTrigger()
      return this.state
    }

    if (handNearFace) {
      this.yawHistory = []
      this.resetHeadReturnTracking()
      this.nodState = 'neutral'
    } else if (this.state === SwipeState.IDLE) {
      if (this.detectHeadShake(yaw)) {
        this.commitTrigger()
        return this.state
      }
      if (this.ENABLE_HEAD_NOD_SWITCH && this.detectHeadNod(pitch)) {
        this.commitTrigger()
        return this.state
      }
    }

    // 检测手部
    if (handLandmarks) {
      const handPos = this.getSwipeAnchor(handLandmarks)
      if (handPos) {
        this.trajectory.push({ x: handPos.x, y: handPos.y })

        if (this.trajectory.length > this.TRAJECTORY_LENGTH) {
          this.trajectory.shift()
        }
      }
    }

    // FSM 状态机
    switch (this.state) {
      case SwipeState.IDLE:
        this.stateIdle(handLandmarks, faceRegion)
        break
      case SwipeState.ENTERING:
        this.stateEntering(handLandmarks, faceRegion)
        break
      case SwipeState.CROSSING:
        this.stateCrossing(handLandmarks, faceRegion)
        break
      case SwipeState.EXITING:
        this.stateExiting(handLandmarks, faceRegion)
        break
      case SwipeState.TRIGGERED:
        this.resetGestureTracking()
        break
    }

    return this.state
  }

  stateIdle(handLandmarks, faceRegion) {
    if (!handLandmarks || !this.isSwipeHand(handLandmarks)) return

    const handPos = this.getSwipeAnchor(handLandmarks)
    if (!handPos) return

    const inBBox = this.isHandTouchingFace(handLandmarks, faceRegion)

    if (inBBox) {
      const inContour = this.pointInPolygon(handPos, faceRegion.contour)
      if (inContour || inBBox) {
        this.state = SwipeState.ENTERING
        this.enteringFrame = Math.max(0, this.frameCount - this.SWIPE_PRE_ROLL_FRAMES)
        this.lastSwipeTouchFrame = this.frameCount
        this.direction = SwipeDirection.NONE
        this.triggerType = null
      }
    }
  }

  stateEntering(handLandmarks, faceRegion) {
    if (!handLandmarks || !this.isSwipeHand(handLandmarks)) {
      if (this.frameCount - this.lastSwipeTouchFrame > this.SWIPE_EXIT_GRACE_FRAMES) {
        this.state = SwipeState.IDLE
      }
      return
    }

    const handPos = this.getSwipeAnchor(handLandmarks)
    if (!handPos) {
      if (this.frameCount - this.lastSwipeTouchFrame > this.SWIPE_EXIT_GRACE_FRAMES) {
        this.state = SwipeState.IDLE
      }
      return
    }

    const inBBox = this.isHandTouchingFace(handLandmarks, faceRegion)

    if (inBBox) {
      this.lastSwipeTouchFrame = this.frameCount
    } else if (this.frameCount - this.lastSwipeTouchFrame > this.SWIPE_EXIT_GRACE_FRAMES) {
      this.state = SwipeState.IDLE
      return
    }

    // 同时检查横向和纵向穿过
    if (this.checkHorizontalCrossing(faceRegion)) {
      this.commitTrigger()
      return
    }
    if (this.checkVerticalCrossing(faceRegion)) {
      this.commitTrigger()
      return
    }

    const { speed } = this.calculateVelocity()
    if (speed < this.MIN_SWIPE_SPEED * 0.45 && this.frameCount - this.enteringFrame > this.ENTERING_TIMEOUT_FRAMES) {
      this.state = SwipeState.IDLE
    }
  }

  stateCrossing(handLandmarks, faceRegion) {
    if (!handLandmarks || !this.isSwipeHand(handLandmarks)) {
      if (this.frameCount - this.lastSwipeTouchFrame > this.SWIPE_EXIT_GRACE_FRAMES) {
        this.state = SwipeState.IDLE
      }
      return
    }

    const handPos = this.getSwipeAnchor(handLandmarks)
    if (!handPos) {
      if (this.frameCount - this.lastSwipeTouchFrame > this.SWIPE_EXIT_GRACE_FRAMES) {
        this.state = SwipeState.IDLE
      }
      return
    }

    const inBBox = this.isHandTouchingFace(handLandmarks, faceRegion)

    if (inBBox) {
      this.lastSwipeTouchFrame = this.frameCount
    }

    if (!inBBox || this.hasCommittedCrossing(handPos, faceRegion)) {
      this.commitTrigger()
      return
    }

    const { speed } = this.calculateVelocity()
    if (speed < this.MIN_SWIPE_SPEED * 0.35 && this.frameCount - this.enteringFrame > this.CROSSING_STALL_FRAMES) {
      this.state = SwipeState.IDLE
    }
  }

  stateExiting() {
    this.commitTrigger()
  }

  /**
   * 获取方向文本描述
   */
  getDirectionText() {
    switch (this.direction) {
      case SwipeDirection.LEFT_TO_RIGHT: return '左→右'
      case SwipeDirection.RIGHT_TO_LEFT: return '右→左'
      case SwipeDirection.TOP_TO_BOTTOM: return '上→下'
      case SwipeDirection.BOTTOM_TO_TOP: return '下→上'
      default: return '-'
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalSwipes: this.totalSwipes,
      currentState: this.state,
      currentDirection: this.direction,
      triggerType: this.triggerType,
      trajectoryLength: this.trajectory.length,
      frameCount: this.frameCount,
      cooldownRemaining: this.maskSwitchCooldown
    }
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HandFaceSwipeDetector, SwipeState, SwipeDirection }
}
