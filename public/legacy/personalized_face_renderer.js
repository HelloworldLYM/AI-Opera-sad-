/**
 * 个性化3D人脸渲染器
 * 
 * 功能：
 * - 基于MediaPipe 468关键点实时驱动顶点
 * - 严格保持官方UV映射（不修改、不打乱、不重排）
 * - 凹内侧贴合真人面部，凸外侧朝外显示脸谱
 * - 支持自定义脸谱UV贴图切换
 * - 表情、头部运动实时跟随
 */
class PersonalizedFaceRenderer {
  constructor() {
    // ======================== 拓扑数据 ========================
    this.topology = null
    this.vertices = []
    this.faces = []
    this.uvCoords = []
    
    // ======================== Three.js对象 ========================
    this.scene = null
    this.camera = null
    this.renderer = null
    this.faceMesh = null
    this.faceBackMesh = null
    this.faceTexture = null
    
    // ======================== 脸谱图集 ========================
    this.FACE_TEXTURE_DIR = './faces/'
    this.faceTextureList = [
      '关羽.png',
      '张飞.png',
      '典韦.png',
      '程咬金.png',
      '姜维.png',
      '夏侯渊.png',
      '宇文成都.png',
      '巨灵神.png',
      '法海.png',
      '窦尔敦.png',
      '郑子明.png',
      '倪荣.png',
    ]
    this.currentTextureIndex = 0
    this.textureSwitchCooldown = 0
    this.TEXTURE_SWITCH_COOLDOWN_FRAMES = 24
    this.textureLoader = new THREE.TextureLoader()
    this.isLiteMode = window.__legacyMode !== 'full'
    this.normalUpdateInterval = this.isLiteMode ? 6 : 3
    this.personalObjNormalUpdateInterval = this.isLiteMode ? 2 : 1
    this.isPageVisible = !document.hidden
    
    // ======================== 平滑滤波 ========================
    this.smoothingFactor = 0.56
    this.LANDMARK_DEADBAND = 0.00055
    this.EXPRESSION_FLEX_GAIN = 1.07
    this.smoothedLandmarks = null
    this.trackingConfidence = 1
    this.lowConfidenceFrames = 0
    this.lowConfidenceThreshold = 0.38
    this.lowConfidenceHideFrames = 12
    this.lastStableLandmarks = null
    this.maskOpacity = 1
    
    // ======================== 动态缩放 ========================
    this.BASE_FACE_WIDTH = 0.25
    this.BASE_SCALE = 0.9
    this.SCALE_SMOOTHING_FACTOR = 0.72
    this.SCALE_DAMPING = 0.7  // 缩放阻尼系数，降低远近变化的敏感度
    this.currentScale = this.BASE_SCALE
    
    // ======================== det2obj映射 ========================
    this.det2objMap = null
    
    // ======================== 状态 ========================
    this.isInitialized = false
    this.currentYaw = 0
    this.currentPitch = 0
    this.currentRoll = 0
    this.meshSource = 'mediapipe-canonical'
    this.isPersonalObjActive = false
    this.personalObjUrl = null
    this.personalObjInfo = null
    this.enableRealtimePersonalObj = false
    this.showRealtimeBackMesh = false
    // Realtime facepaint must be available immediately after MediaPipe detects a face.
    // A generated 3DDFA-V3 personal OBJ can upgrade the mesh later, but it must not
    // block the baseline MediaPipe-driven mask from appearing.
    this.requirePersonalObjForRealtime = false
    this.facepaintTextureFit = {
      scaleX: 1.16,
      scaleY: 1.06,
      offsetX: 0,
      // Facepaint images sat too low on the OBJ UV: lift the source art so
      // eyes/nose align with the reconstructed facial features.
      offsetY: -0.078,
      size: 1024,
    }
    this.personalObjUvBindings = null
    this.personalObjUsesRealtimeDriver = false
    this.uvTriangleIndex = null
    this.driverPositions = null
    this.meshVertexCount = 468
    this.meshFaceCount = 0
  }
  
  /**
   * 初始化渲染器
   * @param {HTMLElement} container - Three.js渲染容器
   * @param {number} width - 渲染宽度
   * @param {number} height - 渲染高度
   */
  async init(container, width = 640, height = 480) {
    try {
      // 1. 加载拓扑数据
      await this.loadTopology()
      
      // 2. 加载det2obj映射
      await this.loadDet2objMap()
      
      // 3. 初始化Three.js场景
      this.initThreeJS(container, width, height)
      
      // 加载默认脸谱纹理
      await this.loadTexture(this.faceTextureList[0])
      
      // 5. 创建个性化人脸网格
      this.createFaceMesh()
      
      this.isInitialized = true
      console.log('✅ 个性化人脸渲染器初始化完成')
      
      return true
    } catch (error) {
      console.error('❌ 渲染器初始化失败:', error)
      return false
    }
  }
  
  /**
   * 加载拓扑数据（顶点、面、UV）
   */
  async loadTopology() {
    try {
      const response = await fetch('face_mesh_topology.json')
      this.topology = await response.json()
      this.vertices = this.topology.vertices
      this.faces = this.topology.faces
      this.uvCoords = this.topology.uv
      console.log(`✅ 拓扑数据加载: ${this.vertices.length}顶点, ${this.faces.length}面, ${this.uvCoords.length}UV`)
    } catch (e) {
      console.error('❌ 拓扑数据加载失败:', e)
      throw e
    }
  }
  
  /**
   * 加载det2obj映射文件
   */
  async loadDet2objMap() {
      try {
        const response = await fetch('det2obj.json')
        this.det2objMap = await response.json()
        console.log('✅ det2obj映射加载完成')
      } catch (e) {
        console.log('⚠️ 使用默认1:1映射')
        this.det2objMap = {}
        for (let i = 0; i < 468; i++) {
          this.det2objMap[i.toString()] = i
        }
      }
    }

  resolveObjIndex(value, size) {
    const index = Number.parseInt(value, 10)
    if (!Number.isFinite(index) || index === 0) return -1
    return index < 0 ? size + index : index - 1
  }

  parseOBJ(objText) {
    const vertices = []
    const uvs = []
    const faces = []
    const lines = String(objText || '').split(/\r?\n/)

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const parts = line.split(/\s+/)
      if (parts[0] === 'v' && parts.length >= 4) {
        vertices.push([
          Number.parseFloat(parts[1]),
          Number.parseFloat(parts[2]),
          Number.parseFloat(parts[3]),
        ])
      } else if (parts[0] === 'vt' && parts.length >= 3) {
        uvs.push([
          Number.parseFloat(parts[1]),
          Number.parseFloat(parts[2]),
        ])
      } else if (parts[0] === 'f' && parts.length >= 4) {
        const tokens = parts.slice(1).map((token) => {
          const tokenParts = token.split('/')
          return {
            v: this.resolveObjIndex(tokenParts[0], vertices.length),
            vt: tokenParts[1] ? this.resolveObjIndex(tokenParts[1], uvs.length) : -1,
          }
        }).filter((token) => token.v >= 0 && token.v < vertices.length)

        for (let i = 1; i < tokens.length - 1; i++) {
          faces.push([tokens[0], tokens[i], tokens[i + 1]])
        }
      }
    }

    if (!vertices.length || !faces.length) {
      throw new Error('OBJ has no usable vertices or faces')
    }

    return { vertices, uvs, faces }
  }

  buildGeometryFromOBJ(parsed) {
    const { vertices, uvs, faces } = parsed
    const mins = [Infinity, Infinity, Infinity]
    const maxs = [-Infinity, -Infinity, -Infinity]

    for (const vertex of vertices) {
      for (let axis = 0; axis < 3; axis++) {
        mins[axis] = Math.min(mins[axis], vertex[axis])
        maxs[axis] = Math.max(maxs[axis], vertex[axis])
      }
    }

    const center = [
      (mins[0] + maxs[0]) * 0.5,
      (mins[1] + maxs[1]) * 0.5,
      (mins[2] + maxs[2]) * 0.5,
    ]
    const width = Math.max(maxs[0] - mins[0], 1e-6)
    const height = Math.max(maxs[1] - mins[1], 1e-6)
    const depth = Math.max(maxs[2] - mins[2], 1e-6)
    const scaleBase = Math.max(width, height, depth, 1e-6)
    const canUseIndexedGeometry = vertices.length <= 65535 && faces.every((face) =>
      face.every((token) => token.v >= 0 && (token.vt < 0 || token.vt === token.v))
    )

    if (canUseIndexedGeometry) {
      const positions = new Float32Array(vertices.length * 3)
      const uvArray = new Float32Array(vertices.length * 2)

      for (let i = 0; i < vertices.length; i++) {
        const vertex = vertices[i]
        positions[i * 3] = (vertex[0] - center[0]) / scaleBase
        positions[i * 3 + 1] = (vertex[1] - center[1]) / scaleBase
        positions[i * 3 + 2] = (vertex[2] - center[2]) / scaleBase

        if (i < uvs.length) {
          const uv = uvs[i]
          uvArray[i * 2] = uv[0]
          uvArray[i * 2 + 1] = 1.0 - uv[1]
        } else {
          uvArray[i * 2] = (vertex[0] - mins[0]) / width
          uvArray[i * 2 + 1] = 1.0 - ((vertex[1] - mins[1]) / height)
        }
      }

      const IndexArray = vertices.length > 65535 ? Uint32Array : Uint16Array
      const indices = new IndexArray(faces.length * 3)
      let indexOffset = 0
      for (const face of faces) {
        for (const token of face) {
          indices[indexOffset++] = token.v
        }
      }

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
      geometry.setIndex(new THREE.BufferAttribute(indices, 1))
      geometry.computeVertexNormals()
      geometry.userData = {
        source: '3ddfa-v3',
        originalVertexCount: vertices.length,
        faceCount: faces.length,
        width,
        height,
        depth,
      }
      return geometry
    }

    const positions = new Float32Array(faces.length * 9)
    const uvArray = new Float32Array(faces.length * 6)
    let positionOffset = 0
    let uvOffset = 0

    for (const face of faces) {
      for (const token of face) {
        const vertex = vertices[token.v]
        // Keep the 3DDFA-V3 OBJ shape faithful: center and uniformly scale only.
        // Do not flip axes or squash depth; the reconstructed OBJ is already 3D.
        positions[positionOffset++] = (vertex[0] - center[0]) / scaleBase
        positions[positionOffset++] = (vertex[1] - center[1]) / scaleBase
        positions[positionOffset++] = (vertex[2] - center[2]) / scaleBase

        if (token.vt >= 0 && token.vt < uvs.length) {
          const uv = uvs[token.vt]
          uvArray[uvOffset++] = uv[0]
          uvArray[uvOffset++] = 1.0 - uv[1]
        } else {
          uvArray[uvOffset++] = (vertex[0] - mins[0]) / width
          uvArray[uvOffset++] = 1.0 - ((vertex[1] - mins[1]) / height)
        }
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
    geometry.computeVertexNormals()
    geometry.userData = {
      source: '3ddfa-v3',
      originalVertexCount: vertices.length,
      faceCount: faces.length,
      width,
      height,
      depth,
    }
    return geometry
  }

  buildUvTriangleIndex() {
    if (this.uvTriangleIndex) return this.uvTriangleIndex
    const gridSize = 32
    const cells = Array.from({ length: gridSize * gridSize }, () => [])
    const triangles = []
    const clamp01 = (value) => Math.max(0, Math.min(1, value))

    for (const face of this.faces || []) {
      if (!face || face.length < 3) continue
      const ids = [face[0], face[1], face[2]]
      const uv = ids.map((id) => {
        const src = this.uvCoords?.[id] || [0, 0]
        return [src[0], 1.0 - src[1]]
      })
      const tri = { ids, uv }
      const triIndex = triangles.length
      triangles.push(tri)

      const minU = clamp01(Math.min(uv[0][0], uv[1][0], uv[2][0]))
      const maxU = clamp01(Math.max(uv[0][0], uv[1][0], uv[2][0]))
      const minV = clamp01(Math.min(uv[0][1], uv[1][1], uv[2][1]))
      const maxV = clamp01(Math.max(uv[0][1], uv[1][1], uv[2][1]))
      const x0 = Math.max(0, Math.min(gridSize - 1, Math.floor(minU * gridSize)))
      const x1 = Math.max(0, Math.min(gridSize - 1, Math.floor(maxU * gridSize)))
      const y0 = Math.max(0, Math.min(gridSize - 1, Math.floor(minV * gridSize)))
      const y1 = Math.max(0, Math.min(gridSize - 1, Math.floor(maxV * gridSize)))

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          cells[y * gridSize + x].push(triIndex)
        }
      }
    }

    const uvVertices = []
    for (let i = 0; i < (this.uvCoords?.length || 0); i++) {
      const src = this.uvCoords[i] || [0, 0]
      uvVertices.push({ id: i, u: src[0], v: 1.0 - src[1] })
    }

    this.uvTriangleIndex = { gridSize, cells, triangles, uvVertices }
    return this.uvTriangleIndex
  }

  getBarycentricInUv(u, v, tri) {
    const a = tri.uv[0]
    const b = tri.uv[1]
    const c = tri.uv[2]
    const v0x = b[0] - a[0]
    const v0y = b[1] - a[1]
    const v1x = c[0] - a[0]
    const v1y = c[1] - a[1]
    const v2x = u - a[0]
    const v2y = v - a[1]
    const denom = v0x * v1y - v1x * v0y
    if (Math.abs(denom) < 1e-8) return null
    const w1 = (v2x * v1y - v1x * v2y) / denom
    const w2 = (v0x * v2y - v2x * v0y) / denom
    const w0 = 1 - w1 - w2
    return [w0, w1, w2]
  }

  findUvBinding(u, v) {
    const index = this.buildUvTriangleIndex()
    const gridSize = index.gridSize
    const x = Math.max(0, Math.min(gridSize - 1, Math.floor(u * gridSize)))
    const y = Math.max(0, Math.min(gridSize - 1, Math.floor(v * gridSize)))
    const tested = new Set()
    const eps = -0.015

    for (let radius = 0; radius <= 2; radius++) {
      for (let cy = Math.max(0, y - radius); cy <= Math.min(gridSize - 1, y + radius); cy++) {
        for (let cx = Math.max(0, x - radius); cx <= Math.min(gridSize - 1, x + radius); cx++) {
          const cell = index.cells[cy * gridSize + cx]
          for (const triIndex of cell) {
            if (tested.has(triIndex)) continue
            tested.add(triIndex)
            const tri = index.triangles[triIndex]
            const weights = this.getBarycentricInUv(u, v, tri)
            if (weights && weights[0] >= eps && weights[1] >= eps && weights[2] >= eps) {
              return { ids: tri.ids, weights }
            }
          }
        }
      }
    }

    let nearest = index.uvVertices[0] || { id: 0, u: 0, v: 0 }
    let bestDist = Infinity
    for (const point of index.uvVertices) {
      const du = point.u - u
      const dv = point.v - v
      const dist = du * du + dv * dv
      if (dist < bestDist) {
        bestDist = dist
        nearest = point
      }
    }
    return { ids: [nearest.id, nearest.id, nearest.id], weights: [1, 0, 0] }
  }

  createPersonalObjUvBindings(geometry) {
    const uvAttr = geometry?.attributes?.uv
    if (!uvAttr || !uvAttr.array || !uvAttr.count) return null

    const indices = new Uint16Array(uvAttr.count * 3)
    const weights = new Float32Array(uvAttr.count * 3)
    const uvs = uvAttr.array

    for (let i = 0; i < uvAttr.count; i++) {
      const binding = this.findUvBinding(uvs[i * 2], uvs[i * 2 + 1])
      indices[i * 3] = binding.ids[0]
      indices[i * 3 + 1] = binding.ids[1]
      indices[i * 3 + 2] = binding.ids[2]
      weights[i * 3] = binding.weights[0]
      weights[i * 3 + 1] = binding.weights[1]
      weights[i * 3 + 2] = binding.weights[2]
    }

    return { indices, weights, count: uvAttr.count }
  }

  async applyPersonalObjFromUrl(objUrl) {
    if (!objUrl || !this.faceMesh) return false
    if (this.isPersonalObjActive && this.personalObjUrl === objUrl) return true
    if (!this.enableRealtimePersonalObj) {
      this.personalObjUrl = objUrl
      this.personalObjInfo = { source: '3ddfa-v3', realtimeApplied: false }
      this.meshSource = 'mediapipe-canonical'
      this.isPersonalObjActive = false
      this.personalObjUsesRealtimeDriver = false
      this.personalObjUvBindings = null
      // Keep the live stage on the stable MediaPipe mesh. The generated OBJ is
      // still passed to the personal model page, but not deformed in realtime.
      return true
    }

    try {
      const response = await fetch(objUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`OBJ fetch failed: ${response.status}`)
      }

      const objText = await response.text()
      const parsed = this.parseOBJ(objText)
      const geometry = this.buildGeometryFromOBJ(parsed)
      geometry.attributes.position.setUsage(THREE.DynamicDrawUsage)
      const uvBindings = this.createPersonalObjUvBindings(geometry)
      if (!uvBindings) {
        throw new Error('Personal OBJ has no usable UV binding')
      }
      const oldGeometry = this.faceMesh.geometry
      this.faceMesh.geometry = geometry
      if (this.faceBackMesh) {
        this.faceBackMesh.geometry = geometry
      }
      if (oldGeometry && typeof oldGeometry.dispose === 'function') {
        oldGeometry.dispose()
      }

      if (this.faceMesh.material) {
        this.faceMesh.material.map = this.faceTexture
        this.faceMesh.material.roughness = 0.9
        this.faceMesh.material.metalness = 0
        if (this.faceMesh.material.emissive) {
          this.faceMesh.material.emissive.setHex(0x2a221c)
          this.faceMesh.material.emissiveIntensity = 0.18
        }
        this.faceMesh.material.needsUpdate = true
      }
      if (this.faceBackMesh?.material) {
        this.faceBackMesh.material.map = this.faceTexture
        this.faceBackMesh.material.needsUpdate = true
      }

      this.meshSource = '3ddfa-v3'
      this.isPersonalObjActive = true
      this.personalObjUsesRealtimeDriver = true
      this.personalObjUvBindings = uvBindings
      this.personalObjUrl = objUrl
      this.personalObjInfo = geometry.userData
      this.meshVertexCount = geometry.attributes.position.count
      this.meshFaceCount = geometry.userData.faceCount || 0
      this._geometryUpdateCounter = 0
      this._firstLandmarkTime = null
      console.log(`3DDFA-V3 personal OBJ applied: ${objUrl}`)
      return true
    } catch (error) {
      console.warn('3DDFA-V3 personal OBJ apply failed:', error)
      return false
    }
  }

  createAlignedFacepaintTexture(image) {
    const fit = this.facepaintTextureFit || {}
    const size = fit.size || 1024
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx || !image) return null

    const baseScale = Math.min(size / image.width, size / image.height)
    const width = image.width * baseScale * (fit.scaleX || 1)
    const height = image.height * baseScale * (fit.scaleY || 1)
    const x = (size - width) * 0.5 + size * (fit.offsetX || 0)
    const y = (size - height) * 0.5 + size * (fit.offsetY || 0)
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(image, x, y, width, height)

    const texture = new THREE.CanvasTexture(canvas)
    texture.flipY = false
    texture.needsUpdate = true
    return texture
  }

  /**
   * 初始化Three.js场景
   */
  initThreeJS(container, width, height) {
    // 渲染器
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !this.isLiteMode,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isLiteMode ? 1 : 1.35))
    this.renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;'
    this.renderer.sortObjects = true
    container.appendChild(this.renderer.domElement)
    if (!this._visibilityHandler) {
      this._visibilityHandler = () => {
        this.isPageVisible = !document.hidden
      }
      document.addEventListener('visibilitychange', this._visibilityHandler)
    }
    
    // 场景
    this.scene = new THREE.Scene()
    
    // 相机
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100)
    this.camera.position.set(0, 0, 0.5)
    
    // 多光源系统
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    this.scene.add(ambientLight)
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0)
    mainLight.position.set(0, 3, 5)
    this.scene.add(mainLight)
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4)
    fillLight.position.set(-3, 1, 2)
    this.scene.add(fillLight)
    
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5)
    rimLight.position.set(2, 2, -3)
    this.scene.add(rimLight)
    
    const pointLight = new THREE.PointLight(0xffffff, 0.3, 10)
    pointLight.position.set(0, 0, 3)
    this.scene.add(pointLight)
    
    // 动画循环
    const animate = () => {
      requestAnimationFrame(animate)
      if (this.isInitialized && this.isPageVisible) {
        if (this.textureSwitchCooldown > 0) {
          this.textureSwitchCooldown--
        }
        this.renderer.render(this.scene, this.camera)
      }
    }
    animate()
  }
  
  /**
     * 加载脸谱纹理
     */
    async loadTexture(textureFile) {
      return new Promise((resolve, reject) => {
        const texturePath = `${this.FACE_TEXTURE_DIR}${textureFile}`

        this.textureLoader.load(
          texturePath,
          (loadedTexture) => {
            // 释放旧纹理，防止内存泄漏
            if (this.faceTexture) {
              this.faceTexture.dispose()
            }

            const texture = this.createAlignedFacepaintTexture(loadedTexture.image) || loadedTexture
            if (texture !== loadedTexture && typeof loadedTexture.dispose === 'function') {
              loadedTexture.dispose()
            } else {
              texture.flipY = false
              texture.needsUpdate = true
            }
            this.faceTexture = texture
            resolve(texture)
          },
          undefined,
          (error) => {
            console.error(`❌ 纹理加载失败: ${textureFile}`, error)
            reject(error)
          }
        )
      })
    }
  
  /**
   * 创建个性化人脸网格
   * 核心：顶点位置完全由MediaPipe实时驱动，不使用固定模型
   */
  createFaceMesh() {
    const geometry = new THREE.BufferGeometry()

    // 初始化空的顶点位置数组（468个顶点）
    const positions = new Float32Array(468 * 3)

    // UV坐标（严格保持官方映射）
    const uvs = new Float32Array(this.uvCoords.length * 2)
    for (let i = 0; i < this.uvCoords.length; i++) {
      uvs[i * 2] = this.uvCoords[i][0]
      uvs[i * 2 + 1] = 1.0 - this.uvCoords[i][1]
    }

    // 面索引
    const indices = new Uint16Array(this.faces.length * 3)
    for (let i = 0; i < this.faces.length; i++) {
      indices[i * 3] = this.faces[i][0]
      indices[i * 3 + 1] = this.faces[i][1]
      indices[i * 3 + 2] = this.faces[i][2]
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.computeVertexNormals()

    // 材质：使用脸谱纹理
    const material = new THREE.MeshStandardMaterial({
      map: this.faceTexture,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: false,
      side: THREE.FrontSide,
      roughness: 0.6,
      metalness: 0.1,
      flatShading: false,
    })
    const backMaterial = new THREE.MeshStandardMaterial({
      map: this.faceTexture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.BackSide,
      roughness: 0.86,
      metalness: 0,
      flatShading: false,
    })

    this.faceMesh = new THREE.Mesh(geometry, material)
    this.faceBackMesh = new THREE.Mesh(geometry, backMaterial)
    this.faceMesh.visible = false
    this.faceBackMesh.visible = false
    if (this.showRealtimeBackMesh) this.scene.add(this.faceBackMesh)
    this.scene.add(this.faceMesh)
    this.meshSource = 'mediapipe-canonical'
    this.isPersonalObjActive = false
    this.personalObjUsesRealtimeDriver = false
    this.personalObjUvBindings = null
    this.meshVertexCount = 468
    this.meshFaceCount = this.faces.length

    console.log(`✅ 人脸网格创建: 468顶点（动态重建）, ${this.faces.length}面`)
  }
  
  /**
   * 更新人脸位置（每帧调用）
   * @param {Array} landmarks - MediaPipe 468关键点
   */
  update(landmarks) {
    if (!this.isInitialized || !landmarks || landmarks.length < 468) {
      return
    }

    const trackingConfidence = this.computeTrackingConfidence(landmarks)
    this.trackingConfidence = trackingConfidence

    let driverLandmarks = landmarks
    if (trackingConfidence >= this.lowConfidenceThreshold) {
      this.lowConfidenceFrames = 0
      this.lastStableLandmarks = landmarks.map((point) => ({ x: point.x, y: point.y, z: point.z || 0 }))
    } else {
      this.lowConfidenceFrames++
      if (this.lastStableLandmarks) {
        driverLandmarks = this.lastStableLandmarks
      }
    }

    // === 启动期延迟：避免纹理尚未上传 GPU / 顶点未稳定时出现纯黑面罩 ===
    // 仅在拿到有效 landmarks 后开始计时，延迟期内不显示 mesh
    if (!this._firstLandmarkTime) {
      this._firstLandmarkTime = performance.now()
    }
    const WARMUP_MS = 80
    const warmupDone = (performance.now() - this._firstLandmarkTime) >= WARMUP_MS

    // 纹理是否已上传到 GPU
    const textureReady = !!(this.faceTexture && this.faceTexture.image &&
      (this.faceTexture.image.complete !== false))

    // 平滑关键点
    const smoothed = this.smoothLandmarks(driverLandmarks)

    // 计算动态缩放（保持脸谱和真实面部同等大小）
    const dynamicScale = this.calculateDynamicScale(smoothed)

    // 记录姿态用于手势检测
    const pose = this.solvePnP(smoothed)
    this.currentYaw = pose.yaw
    this.currentPitch = pose.pitch
    this.currentRoll = pose.roll

    if (this.isPersonalObjActive && this.personalObjUsesRealtimeDriver) {
      this.updatePersonalObjVerticesFromLandmarks(smoothed, dynamicScale)
      this.faceMesh.rotation.set(0, 0, 0)
      this.faceMesh.position.set(0, 0, 0)
      this.faceMesh.scale.set(1, 1, 1)
      if (this.faceBackMesh) {
        this.faceBackMesh.rotation.set(0, 0, 0)
        this.faceBackMesh.position.set(0, 0, 0)
        this.faceBackMesh.scale.set(1, 1, 1)
      }
    } else if (this.requirePersonalObjForRealtime) {
      this.faceMesh.visible = false
      if (this.faceBackMesh) this.faceBackMesh.visible = false
      return
    } else {
      // 直接更新顶点位置
      this.updateFaceVertices(smoothed, dynamicScale)

      // 不应用任何旋转和位移变换，让顶点位置完全由MediaPipe驱动
      this.faceMesh.rotation.set(0, 0, 0)
      this.faceMesh.position.set(0, 0, 0)
      this.faceMesh.scale.set(1, 1, 1)
      if (this.faceBackMesh) {
        this.faceBackMesh.rotation.set(0, 0, 0)
        this.faceBackMesh.position.set(0, 0, 0)
        this.faceBackMesh.scale.set(1, 1, 1)
      }
    }

    // 只有启动期结束 + 纹理就绪才显示，避免黑脸
    const confidenceOpacity = trackingConfidence >= this.lowConfidenceThreshold
      ? 1
      : Math.max(0.18, trackingConfidence / this.lowConfidenceThreshold)
    this.applyMaskOpacity(confidenceOpacity)

    this.faceMesh.visible = warmupDone && textureReady && this.lowConfidenceFrames < this.lowConfidenceHideFrames
    if (this.faceBackMesh) this.faceBackMesh.visible = false
  }

  computeTrackingConfidence(landmarks) {
    const required = [1, 10, 33, 152, 234, 263, 454]
    if (!required.every((index) => landmarks[index])) return 0

    const leftEye = landmarks[33]
    const rightEye = landmarks[263]
    const nose = landmarks[1]
    const chin = landmarks[152]
    const forehead = landmarks[10]
    const leftCheek = landmarks[234]
    const rightCheek = landmarks[454]
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x)
    const faceHeight = Math.abs(chin.y - forehead.y)
    const eyeDistance = Math.abs(rightEye.x - leftEye.x)
    const noseCentered =
      1 - Math.min(1, Math.abs(nose.x - (leftCheek.x + rightCheek.x) / 2) / Math.max(faceWidth * 0.55, 0.001))

    const sizeScore = Math.min(1, Math.max(0, (faceWidth - 0.08) / 0.14))
    const shapeScore = Math.min(1, Math.max(0, faceHeight / Math.max(faceWidth, 0.001) / 1.8))
    const eyeScore = Math.min(1, Math.max(0, eyeDistance / Math.max(faceWidth, 0.001) / 0.34))
    return Math.max(0, Math.min(1, sizeScore * 0.32 + shapeScore * 0.24 + eyeScore * 0.22 + noseCentered * 0.22))
  }

  applyMaskOpacity(opacity) {
    const nextOpacity = Math.max(0, Math.min(1, opacity))
    this.maskOpacity = this.maskOpacity * 0.72 + nextOpacity * 0.28
    const apply = (mesh) => {
      if (!mesh || !mesh.material) return
      mesh.material.transparent = true
      mesh.material.opacity = this.maskOpacity
      mesh.material.needsUpdate = true
    }
    apply(this.faceMesh)
    apply(this.faceBackMesh)
  }
  
  /**
   * 平滑关键点数据
   */
  smoothLandmarks(newLandmarks) {
    if (!this.smoothedLandmarks || this.smoothedLandmarks.length !== newLandmarks.length) {
      this.smoothedLandmarks = JSON.parse(JSON.stringify(newLandmarks))
      return this.smoothedLandmarks
    }
    
    for (let i = 0; i < newLandmarks.length; i++) {
      const prev = this.smoothedLandmarks[i]
      const next = newLandmarks[i]
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      const dz = (next.z || 0) - (prev.z || 0)
      const deadband = this.LANDMARK_DEADBAND || 0
      if (Math.abs(dx) > deadband) prev.x = this.smoothingFactor * prev.x + (1 - this.smoothingFactor) * next.x
      if (Math.abs(dy) > deadband) prev.y = this.smoothingFactor * prev.y + (1 - this.smoothingFactor) * next.y
      if (Math.abs(dz) > deadband) prev.z = this.smoothingFactor * (prev.z || 0) + (1 - this.smoothingFactor) * (next.z || 0)
    }
    
    return this.smoothedLandmarks
  }
  
  /**
   * 动态缩放计算
   */
  calculateDynamicScale(landmarks) {
    if (!landmarks || landmarks.length < 468) {
      return this.currentScale
    }
    
    const rightFaceEdge = landmarks[234]
    const leftFaceEdge = landmarks[454]
    
    if (!rightFaceEdge || !leftFaceEdge) {
      return this.currentScale
    }
    
    const currentFaceWidth = Math.abs(leftFaceEdge.x - rightFaceEdge.x)
    const rawScale = (currentFaceWidth / this.BASE_FACE_WIDTH) * this.BASE_SCALE

    // 应用阻尼，减少远近变化的影响
    const targetScale = this.BASE_SCALE + (rawScale - this.BASE_SCALE) * this.SCALE_DAMPING
    this.currentScale = this.currentScale * this.SCALE_SMOOTHING_FACTOR + targetScale * (1 - this.SCALE_SMOOTHING_FACTOR)
    
    return this.currentScale
  }

  computeRealtimeDriverPositions(landmarks, dynamicScale) {
    if (!landmarks || landmarks.length < 468 || !this.det2objMap) return null
    if (!this.driverPositions || this.driverPositions.length !== 468 * 3) {
      this.driverPositions = new Float32Array(468 * 3)
    }

    const positions = this.driverPositions
    const aspect = 640 / 480
    const scaleX = dynamicScale * aspect * 0.92
    const scaleY = dynamicScale * 0.79
    const leftFaceEdge = landmarks[234]
    const rightFaceEdge = landmarks[454]
    const forehead = landmarks[10]
    const chin = landmarks[152]
    const centerX = leftFaceEdge && rightFaceEdge ? (leftFaceEdge.x + rightFaceEdge.x) / 2 : 0.5
    const centerY = forehead && chin ? (forehead.y + chin.y) / 2 : 0.5
    const yawDeg = Math.abs((Number.isFinite(this.currentYaw) ? this.currentYaw : 0) * 180 / Math.PI)
    const profileRelax = Math.max(0, Math.min(1, (yawDeg - 18) / 16))
    const flexGain = 1 + ((this.EXPRESSION_FLEX_GAIN || 1) - 1) * (1 - profileRelax)

    for (let landmarkIndex in this.det2objMap) {
      const vertexIndex = this.det2objMap[landmarkIndex]
      const landmark = landmarks[landmarkIndex]
      if (!landmark || vertexIndex < 0 || vertexIndex >= 468) continue

      const localX = (landmark.x - centerX) * flexGain + centerX - 0.5
      const localY = (landmark.y - centerY) * flexGain + centerY - 0.5
      positions[vertexIndex * 3] = localX * scaleX
      positions[vertexIndex * 3 + 1] = -localY * scaleY
      positions[vertexIndex * 3 + 2] = -landmark.z * dynamicScale * 3.08
    }

    return positions
  }

  updatePersonalObjVerticesFromLandmarks(landmarks, dynamicScale) {
    if (!this.faceMesh || !this.personalObjUvBindings) return
    const driverPositions = this.computeRealtimeDriverPositions(landmarks, dynamicScale)
    if (!driverPositions) return

    const posAttr = this.faceMesh.geometry.attributes.position
    const positions = posAttr.array
    const { indices, weights, count } = this.personalObjUvBindings

    for (let i = 0; i < count; i++) {
      const bi = i * 3
      const ai = indices[bi] * 3
      const bj = indices[bi + 1] * 3
      const ck = indices[bi + 2] * 3
      const w0 = weights[bi]
      const w1 = weights[bi + 1]
      const w2 = weights[bi + 2]
      positions[bi] = driverPositions[ai] * w0 + driverPositions[bj] * w1 + driverPositions[ck] * w2
      positions[bi + 1] = driverPositions[ai + 1] * w0 + driverPositions[bj + 1] * w1 + driverPositions[ck + 1] * w2
      positions[bi + 2] = driverPositions[ai + 2] * w0 + driverPositions[bj + 2] * w1 + driverPositions[ck + 2] * w2
    }

    posAttr.needsUpdate = true
    if (!this._geometryUpdateCounter) this._geometryUpdateCounter = 0
    this._geometryUpdateCounter++
    const normalInterval = this.personalObjNormalUpdateInterval || this.normalUpdateInterval
    if (this._geometryUpdateCounter % normalInterval === 0) {
      this.faceMesh.geometry.computeVertexNormals()
    }
  }
  
  /**
   * 更新人脸顶点（MediaPipe驱动）
   * 核心：实时重建用户专属3D面部，保持真实脸型比例
   */
  updateFaceVertices(landmarks, dynamicScale) {
    if (!this.faceMesh) return
    const driverPositions = this.computeRealtimeDriverPositions(landmarks, dynamicScale)
    if (!driverPositions) return

    const positions = this.faceMesh.geometry.attributes.position.array
    positions.set(driverPositions)

    // 相机宽高比修正（640x480 = 4:3）
    const aspect = 640 / 480
    const scaleX = dynamicScale * aspect * 0.92  // X轴需要按宽高比放大，缩小5%
    const scaleY = dynamicScale * 0.79    // Y轴压缩，修正脸型，缩小5%

    // 直接使用MediaPipe关键点，保持真实脸型
    for (let landmarkIndex in this.det2objMap) {
      const vertexIndex = this.det2objMap[landmarkIndex]
      const landmark = landmarks[landmarkIndex]
      if (!landmark) continue

      // MediaPipe归一化坐标 → Three.js 3D坐标（修正宽高比）
      const x = (landmark.x - 0.5) * scaleX
      const y = -(landmark.y - 0.5) * scaleY
      const z = -landmark.z * dynamicScale * 3.0  // Z轴保持立体感

      positions[vertexIndex * 3] = x
      positions[vertexIndex * 3 + 1] = y
      positions[vertexIndex * 3 + 2] = z
    }

    positions.set(driverPositions)

    this.faceMesh.geometry.attributes.position.needsUpdate = true

    // 降低几何计算频率，每3帧计算一次，保持光影平滑
    if (!this._geometryUpdateCounter) this._geometryUpdateCounter = 0
    this._geometryUpdateCounter++

    if (this._geometryUpdateCounter % this.normalUpdateInterval === 0) {
      this.faceMesh.geometry.computeVertexNormals()
    }
  }
  
  /**
   * PnP姿态解算
   */
  solvePnP(landmarks) {
    const leftEye = landmarks[33]
    const rightEye = landmarks[263]
    const nose = landmarks[1]
    const chin = landmarks[152]
    const leftCheek = landmarks[234]
    const rightCheek = landmarks[454]
    const forehead = landmarks[10]
    
    const yaw = (leftCheek.z - rightCheek.z) * 8.0
    this.currentYaw = yaw
    const pitch = (forehead.y - chin.y) * 5.0 - 0.5
    const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)
    
    const centerX = (leftEye.x + rightEye.x) / 2
    const centerY = (leftEye.y + chin.y) / 2
    
    const tx = 0
    const ty = 0
    const tz = 0
    
    return { yaw, pitch, roll, tx, ty, tz }
  }
  
  /**
   * 切换脸谱纹理
   * @param {string} specificTexture - 可选：指定纹理文件名
   */
  async switchTexture(specificTexture) {
    if (this.textureSwitchCooldown > 0) {
      return
    }
    
    this.textureSwitchCooldown = this.TEXTURE_SWITCH_COOLDOWN_FRAMES
    
    let nextTexture
    if (specificTexture) {
      nextTexture = specificTexture
      const cleanTexture = String(specificTexture).replace(/^\.?\//, '').replace(/^faces\//i, '')
      const matchedIndex = this.faceTextureList.findIndex((item) => item === cleanTexture)
      if (matchedIndex >= 0) {
        this.currentTextureIndex = matchedIndex
        nextTexture = cleanTexture
      }
    } else {
      this.currentTextureIndex = (this.currentTextureIndex + 1) % this.faceTextureList.length
      nextTexture = this.faceTextureList[this.currentTextureIndex]
    }
    
    try {
      await this.loadTexture(nextTexture)
      
      // 更新材质
      if (this.faceMesh) {
        this.faceMesh.material.map = this.faceTexture
        this.faceMesh.material.needsUpdate = true
      }
      if (this.faceBackMesh?.material) {
        this.faceBackMesh.material.map = this.faceTexture
        this.faceBackMesh.material.needsUpdate = true
      }
      
      console.log(`🎭 脸谱切换: ${nextTexture}`)
      return true
    } catch (error) {
      console.error('❌ 脸谱切换失败:', error)
      return false
    }
  }

  exportCurrentGeometryOBJ() {
    if (!this.faceMesh || !this.faceMesh.geometry) return null

    const geometry = this.faceMesh.geometry
    const posAttr = geometry.attributes.position
    const uvAttr = geometry.attributes.uv
    if (!posAttr) return null

    let obj = '# personalized realtime face mesh\n'
    obj += `# source: ${this.meshSource || 'mediapipe-canonical'}\n`
    obj += `# vertices: ${posAttr.count}\n`
    obj += `# faces: ${geometry.index ? geometry.index.count / 3 : posAttr.count / 3}\n\n`

    const positions = posAttr.array
    for (let i = 0; i < posAttr.count; i++) {
      obj += `v ${positions[i * 3].toFixed(6)} ${positions[i * 3 + 1].toFixed(6)} ${positions[i * 3 + 2].toFixed(6)}\n`
    }

    obj += '\n'

    if (uvAttr) {
      const uvArray = uvAttr.array
      for (let i = 0; i < uvAttr.count; i++) {
        obj += `vt ${uvArray[i * 2].toFixed(6)} ${uvArray[i * 2 + 1].toFixed(6)}\n`
      }
      obj += '\n'
    }

    if (geometry.index) {
      const indices = geometry.index.array
      for (let i = 0; i < indices.length; i += 3) {
        const v1 = indices[i] + 1
        const v2 = indices[i + 1] + 1
        const v3 = indices[i + 2] + 1
        obj += uvAttr ? `f ${v1}/${v1} ${v2}/${v2} ${v3}/${v3}\n` : `f ${v1} ${v2} ${v3}\n`
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        const v1 = i + 1
        const v2 = i + 2
        const v3 = i + 3
        obj += uvAttr ? `f ${v1}/${v1} ${v2}/${v2} ${v3}/${v3}\n` : `f ${v1} ${v2} ${v3}\n`
      }
    }

    return obj
  }
  
  /**
   * 导出个性化OBJ模型
   * @returns {string} OBJ文件内容
   */
  exportOBJ() {
    if (this.isPersonalObjActive) {
      return this.exportCurrentGeometryOBJ()
    }

    if (!this.topology) {
      return null
    }
    
    let obj = '# 个性化3D人脸模型\n'
    obj += '# 基于MediaPipe canonical face model\n'
    obj += '# UV映射：官方标准（未修改）\n'
    obj += `# 顶点数: ${this.vertices.length}\n`
    obj += `# 面数: ${this.faces.length}\n\n`
    
    // 顶点
    const positions = this.faceMesh.geometry.attributes.position.array
    for (let i = 0; i < this.vertices.length; i++) {
      obj += `v ${positions[i * 3].toFixed(6)} ${positions[i * 3 + 1].toFixed(6)} ${positions[i * 3 + 2].toFixed(6)}\n`
    }
    
    obj += '\n'
    
    // UV坐标
    for (let i = 0; i < this.uvCoords.length; i++) {
      obj += `vt ${this.uvCoords[i][0].toFixed(6)} ${this.uvCoords[i][1].toFixed(6)}\n`
    }
    
    obj += '\n'
    
    // 面
    for (let i = 0; i < this.faces.length; i++) {
      const v1 = this.faces[i][0] + 1
      const v2 = this.faces[i][1] + 1
      const v3 = this.faces[i][2] + 1
      obj += `f ${v1}/${v1} ${v2}/${v2} ${v3}/${v3}\n`
    }
    
    return obj
  }
  
  /**
   * 抓取当前网格的快照（顶点+UV+面索引+纹理路径）
   * 用于"脸谱陈列馆"
   *
   * 注意：实时渲染时 X/Y/Z 各自使用了不同的缩放因子（aspect 修正、Y 压缩、Z 放大）
   * 直接保存会导致从侧面看被拉长。这里统一归一化到同一物理尺度，让模型从任意角度都比例正确。
   */
  resolveSnapshotTexturePath(textureKey) {
    const raw = String(textureKey || this.faceTextureList[this.currentTextureIndex] || '').trim()
    const clean = raw
      .replace(/^\.?\//, '')
      .replace(/^faces\//i, '')
    const resolvedKey = window.resolveFaceKnowledgeKey
      ? window.resolveFaceKnowledgeKey(clean)
      : clean.replace(/\.(png|jpe?g|webp|gif|avif)$/i, '')
    const face = window.FaceKnowledgeData?.[resolvedKey]
    if (face?.image) return face.image

    const knownFallbacks = {
      guanyu: '关羽.png',
      zhangfei: '张飞.png',
      dianwei: '典韦.png',
      chengyaojin: '程咬金.png',
      jiangwei: '姜维.png',
      xiahouyuan: '夏侯渊.png',
      yuwenchengdu: '宇文成都.png',
      julingshen: '巨灵神.png',
      fahai: '法海.png',
      douerdun: '窦尔敦.png',
      zhengziming: '郑子明.png',
      nirong: '倪荣.png',
    }
    if (knownFallbacks[String(resolvedKey || '').toLowerCase()]) {
      return `${this.FACE_TEXTURE_DIR}${knownFallbacks[String(resolvedKey).toLowerCase()]}`
    }

    const filename = /\.(png|jpe?g|webp|gif|avif)$/i.test(clean) ? clean : `${clean || '关羽'}.png`
    return `${this.FACE_TEXTURE_DIR}${filename}`
  }

  captureSnapshot(textureKey, options = {}) {
    if (!this.faceMesh || !this.isInitialized) return null
    const geom = this.faceMesh.geometry
    const posAttr = geom.attributes.position
    const uvAttr = geom.attributes.uv
    const idxAttr = geom.index
    if (!posAttr || !uvAttr) return null
    if (!this.faceMesh.visible && !options.allowHidden) return null

    // 检查顶点是否有效（非全零 = 有真实人脸数据）
    const src = posAttr.array
    let nonZero = false
    for (let i = 0; i < src.length; i += 3) {
      if (src[i] !== 0 || src[i + 1] !== 0 || src[i + 2] !== 0) { nonZero = true; break }
    }
    if (!nonZero) return null

    // === 比例归一化 ===
    // updateFaceVertices 使用的缩放系数（与 dynamicScale 解耦的常数比值）：
    //   scaleX_per = aspect * 0.92 = (640/480) * 0.92 ≈ 1.2267
    //   scaleY_per = 0.79
    //   scaleZ_per = 3.0
    // 以 Y 为基准，把 X、Z 缩回到同一物理尺度
    const aspect = 640 / 480
    const scaleX_per = aspect * 0.92
    const scaleY_per = 0.79
    const scaleZ_per = 3.0
    const xCorr = scaleY_per / scaleX_per   // ≈ 0.6440
    const zCorr = scaleY_per / scaleZ_per   // ≈ 0.2633

    const useRawPersonalObjCoords = this.isPersonalObjActive && !this.personalObjUsesRealtimeDriver
    const normalized = new Float32Array(src.length)
    for (let i = 0; i < src.length; i += 3) {
      normalized[i] = useRawPersonalObjCoords ? src[i] : src[i] * xCorr
      normalized[i + 1] = src[i + 1]
      normalized[i + 2] = useRawPersonalObjCoords ? src[i + 2] : src[i + 2] * zCorr
    }

    let indices
    if (idxAttr) {
      const IndexArray = idxAttr.array.length > 65535 ? Uint32Array : Uint16Array
      indices = new IndexArray(idxAttr.array)
    } else {
      const IndexArray = posAttr.count > 65535 ? Uint32Array : Uint16Array
      indices = new IndexArray(posAttr.count)
      for (let i = 0; i < posAttr.count; i++) indices[i] = i
    }

    const key = textureKey || this.faceTextureList[this.currentTextureIndex]
    return {
      textureKey: key,
      texturePath: this.resolveSnapshotTexturePath(key),
      positions: normalized,
      uvs: new Float32Array(uvAttr.array),
      indices,
      source: this.meshSource,
      timestamp: Date.now(),
    }
  }

  /**
   * 设置脸谱发光强度（喷火蓄力用）
   * @param {number} intensity - 0=无发光, 1.5=最亮
   */
  setEmissive(intensity) {
    if (!this.faceMesh || !this.faceMesh.material) return
    if (intensity <= 0) {
      this.faceMesh.material.emissive.setHex(0x000000)
      this.faceMesh.material.emissiveIntensity = 0
    } else {
      this.faceMesh.material.emissive.setHex(0xff6600)
      this.faceMesh.material.emissiveIntensity = intensity
    }
    this.faceMesh.material.needsUpdate = true
  }

  /**
   * 下载OBJ文件
   * @param {string} filename - 文件名
   */
  downloadOBJ(filename = 'personalized_face.obj') {
    const objContent = this.exportOBJ()
    if (!objContent) {
      console.error('❌ OBJ导出失败')
      return
    }
    
    const blob = new Blob([objContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    
    console.log(`✅ OBJ已下载: ${filename}`)
  }
}
