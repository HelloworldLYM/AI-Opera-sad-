(function () {
  const stage = document.getElementById('stage');
  const sceneTitle = document.getElementById('sceneTitle');
  const sceneNote = document.getElementById('sceneNote');
  const activeMaskTitle = document.getElementById('activeMaskTitle');
  const activeMaskCopy = document.getElementById('activeMaskCopy');
  const textureState = document.getElementById('textureState');
  const modelSource = document.getElementById('modelSource');
  const maskStrip = document.getElementById('maskStrip');

  const params = new URLSearchParams(window.location.search);
  const sceneId = params.get('scene') || 'demo-stage';
  const personalObjUrl = '/generated_masks/autodl_user_001/personal_face.obj';

  const faces = [
    { key: 'guanyu', title: '关羽', role: '红整脸', image: '/legacy/faces/关羽.png', meaning: '忠义、勇武、守信' },
    { key: 'zhangfei', title: '张飞', role: '黑十字门脸', image: '/legacy/faces/张飞.png', meaning: '刚烈、豪爽、勇猛' },
    { key: 'dianwei', title: '典韦', role: '黄花三块瓦脸', image: '/legacy/faces/典韦.png', meaning: '骁勇、凶猛、护主' },
    { key: 'chengyaojin', title: '程咬金', role: '绿花脸', image: '/legacy/faces/程咬金.png', meaning: '草莽、豪放、猛烈' },
    { key: 'jiangwei', title: '姜维', role: '红三块瓦脸', image: '/legacy/faces/姜维.png', meaning: '忠勇、谋略、儒将' },
    { key: 'xiahouyuan', title: '夏侯渊', role: '黑脸净', image: '/legacy/faces/夏侯渊.png', meaning: '威猛、刚烈、强硬' },
    { key: 'yuwenchengdu', title: '宇文成都', role: '黄脸', image: '/legacy/faces/宇文成都.png', meaning: '骁勇、高傲、威压' },
    { key: 'julingshen', title: '巨灵神', role: '神怪脸', image: '/legacy/faces/巨灵神.png', meaning: '神力、威严、先锋' },
    { key: 'fahai', title: '法海', role: '僧脸 / 神佛谱式', image: '/legacy/faces/法海.png', meaning: '法力、庄严、执拗' },
    { key: 'douerdun', title: '窦尔敦', role: '蓝花脸', image: '/legacy/faces/窦尔敦.png', meaning: '刚强、心计、绿林' },
    { key: 'zhengziming', title: '郑子明', role: '破脸', image: '/legacy/faces/郑子明.png', meaning: '憨直、冲突、奇特' },
    { key: 'nirong', title: '倪荣', role: '绿脸英雄类', image: '/legacy/faces/倪荣.png', meaning: '刚勇、侠气、扶弱' },
  ];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  scene.fog = new THREE.FogExp2(0x07080b, 0.038);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.04, 120);
  camera.position.set(0, 1.72, 7.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  stage.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.52, -5.2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 2.2;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI * 0.88;

  const clock = new THREE.Clock();
  const keys = new Set();
  const maskGroups = [];
  let featuredMask = null;
  let selectedIndex = 0;
  let pointCloud = null;
  let uvPulse = null;

  window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

  function material(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.62,
      metalness: options.metalness ?? 0.06,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      side: options.side || THREE.FrontSide,
      transparent: options.transparent || false,
      opacity: options.opacity ?? 1,
    });
  }

  function physicalMaterial(color, options = {}) {
    const MaterialType = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    return new MaterialType({
      color,
      roughness: options.roughness ?? 0.42,
      metalness: options.metalness ?? 0.06,
      clearcoat: options.clearcoat ?? 0,
      clearcoatRoughness: options.clearcoatRoughness ?? 0.24,
      transmission: options.transmission ?? 0,
      thickness: options.thickness ?? 0.2,
      transparent: options.transparent || false,
      opacity: options.opacity ?? 1,
      side: options.side || THREE.FrontSide,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
    });
  }

  function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    draw(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  function createLacquerTexture() {
    return canvasTexture(512, 512, (ctx, width, height) => {
      ctx.fillStyle = '#1a080b';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 36; i++) {
        const y = (i * 37) % height;
        const x = (i * 83) % width;
        const radius = 42 + (i % 7) * 8;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(217,45,32,0.26)');
        gradient.addColorStop(1, 'rgba(217,45,32,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(215,168,74,0.24)';
      ctx.lineWidth = 2;
      for (let y = 42; y < height; y += 86) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= width; x += 24) {
          ctx.quadraticCurveTo(x + 12, y - 18, x + 24, y);
        }
        ctx.stroke();
      }
    });
  }

  function createGridTexture() {
    return canvasTexture(512, 512, (ctx, width, height) => {
      ctx.fillStyle = '#071217';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(32,215,232,0.22)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= width; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(215,168,74,0.42)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.5, width * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width * 0.22, height * 0.5);
      ctx.bezierCurveTo(width * 0.34, height * 0.2, width * 0.66, height * 0.2, width * 0.78, height * 0.5);
      ctx.bezierCurveTo(width * 0.66, height * 0.78, width * 0.34, height * 0.78, width * 0.22, height * 0.5);
      ctx.stroke();
    });
  }

  function createLabelTexture(title, subtitle) {
    return canvasTexture(512, 168, (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(9,10,13,0.92)';
      roundRect(ctx, 18, 18, width - 36, height - 36, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(215,168,74,0.46)';
      ctx.lineWidth = 2;
      roundRect(ctx, 18, 18, width - 36, height - 36, 18);
      ctx.stroke();
      ctx.fillStyle = '#f2e8d5';
      ctx.font = 'bold 42px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 76);
      ctx.fillStyle = 'rgba(32,215,232,0.86)';
      ctx.font = '24px Consolas, monospace';
      ctx.fillText(subtitle, width / 2, 116);
    });
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function createPolishedFloorTexture() {
    return canvasTexture(1024, 1024, (ctx, width, height) => {
      ctx.fillStyle = '#12110e';
      ctx.fillRect(0, 0, width, height);
      for (let y = 0; y < height; y += 128) {
        for (let x = 0; x < width; x += 128) {
          const shade = ((x / 128 + y / 128) % 2) ? 18 : 24;
          ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 5})`;
          ctx.fillRect(x, y, 128, 128);
        }
      }
      ctx.strokeStyle = 'rgba(242,232,213,0.055)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= width; i += 128) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
      }
      const shine = ctx.createLinearGradient(0, 0, width, height);
      shine.addColorStop(0, 'rgba(32,215,232,0)');
      shine.addColorStop(0.42, 'rgba(32,215,232,0.08)');
      shine.addColorStop(0.58, 'rgba(215,168,74,0.08)');
      shine.addColorStop(1, 'rgba(215,168,74,0)');
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, width, height);
    });
  }

  function createCeilingLightTexture(label = '') {
    return canvasTexture(1024, 640, (ctx, width, height) => {
      ctx.fillStyle = '#f2e8d5';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(9,10,13,0.34)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const y = 42 + i * 24;
        ctx.beginPath();
        ctx.moveTo(58, y);
        for (let x = 58; x < width - 58; x += 34) {
          ctx.quadraticCurveTo(x + 16, y - 18 * Math.sin((i + x) * 0.04), x + 34, y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(32,215,232,0.62)';
      ctx.lineWidth = 8;
      roundRect(ctx, 26, 26, width - 52, height - 52, 54);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(215,168,74,0.48)';
      ctx.lineWidth = 4;
      roundRect(ctx, 62, 62, width - 124, height - 124, 44);
      ctx.stroke();
      ctx.fillStyle = 'rgba(9,10,13,0.72)';
      ctx.font = 'bold 42px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      if (label) ctx.fillText(label, width / 2, height / 2 + 14);
    });
  }

  function createWallCopyTexture(title, lines) {
    return canvasTexture(768, 520, (ctx, width, height) => {
      ctx.fillStyle = '#161414';
      ctx.fillRect(0, 0, width, height);
      const glow = ctx.createLinearGradient(0, 0, width, 0);
      glow.addColorStop(0, 'rgba(217,45,32,0.34)');
      glow.addColorStop(0.12, 'rgba(217,45,32,0.08)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#d7a84a';
      ctx.font = 'bold 42px "Microsoft YaHei", sans-serif';
      ctx.fillText(title, 54, 82);
      ctx.fillStyle = 'rgba(242,232,213,0.78)';
      ctx.font = '28px "Microsoft YaHei", sans-serif';
      lines.forEach((line, index) => ctx.fillText(line, 54, 148 + index * 48));
      ctx.strokeStyle = 'rgba(215,168,74,0.38)';
      ctx.lineWidth = 3;
      ctx.strokeRect(28, 28, width - 56, height - 56);
    });
  }

  function createMaskPatternTexture(label, color = '#d92d20') {
    return canvasTexture(512, 512, (ctx, width, height) => {
      ctx.fillStyle = '#10100f';
      ctx.fillRect(0, 0, width, height);
      const gradient = ctx.createRadialGradient(width / 2, height / 2, 12, width / 2, height / 2, 248);
      gradient.addColorStop(0, `${color}aa`);
      gradient.addColorStop(0.48, `${color}30`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(242,232,213,0.52)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2 + 8, 128, 184, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(215,168,74,0.68)';
      ctx.beginPath();
      ctx.moveTo(width / 2, 96);
      ctx.bezierCurveTo(218, 180, 226, 274, width / 2, 414);
      ctx.bezierCurveTo(286, 274, 294, 180, width / 2, 96);
      ctx.stroke();
      ctx.fillStyle = '#f2e8d5';
      ctx.beginPath();
      ctx.ellipse(210, 242, 32, 20, -0.22, 0, Math.PI * 2);
      ctx.ellipse(302, 242, 32, 20, 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(9,10,13,0.72)';
      ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, width / 2, 468);
    });
  }

  function createFloorReflectionPatch(width, depth, color, opacity) {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.018;
    return patch;
  }

  function addTexturedPanel(texture, width, height, position, rotationY = 0) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    );
    panel.position.set(position[0], position[1], position[2]);
    panel.rotation.y = rotationY;
    scene.add(panel);
    return panel;
  }

  function createGlassMaterial(opacity = 0.24) {
    return physicalMaterial(0xb9e7de, {
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      transmission: 0.58,
      thickness: 0.18,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
    });
  }

  function addCaseEdges(group, width, height, depth) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(geometry);
    const lines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xcde8dd, transparent: true, opacity: 0.42 })
    );
    lines.position.y = height / 2;
    group.add(lines);
  }

  function createDisplayCase({
    width = 1.16,
    depth = 1.16,
    glassHeight = 1.8,
    baseHeight = 0.56,
    top = true,
  } = {}) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.16, baseHeight, depth + 0.16),
      physicalMaterial(0x11100d, { roughness: 0.28, metalness: 0.18, clearcoat: 0.6 })
    );
    base.position.y = baseHeight / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, 0.22, depth * 0.72),
      physicalMaterial(0xe6ddc7, { roughness: 0.34, metalness: 0.04, clearcoat: 0.4 })
    );
    plinth.position.y = baseHeight + 0.11;
    plinth.castShadow = true;
    group.add(plinth);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(width, glassHeight, depth),
      createGlassMaterial(0.22)
    );
    glass.position.y = baseHeight + glassHeight / 2 + 0.02;
    group.add(glass);
    addCaseEdges(group, width, glassHeight, depth);
    group.children[group.children.length - 1].position.y += baseHeight + 0.02;

    if (top) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.12, 0.16, depth + 0.12),
        physicalMaterial(0x0b0b0c, { roughness: 0.25, metalness: 0.22, clearcoat: 0.45 })
      );
      cap.position.y = baseHeight + glassHeight + 0.13;
      group.add(cap);
    }

    const light = new THREE.PointLight(0xf2e8d5, 0.52, 2.8);
    light.position.set(0, baseHeight + glassHeight - 0.18, 0);
    group.add(light);
    return group;
  }

  function createMuseumMaskObject(maskGeometry, face, scale = 1) {
    const group = new THREE.Group();
    group.userData.face = face;
    group.scale.set(scale, scale, scale);
    return createMaskMaterial(face).then((frontMaterial) => {
      const front = new THREE.Mesh(maskGeometry, frontMaterial);
      front.castShadow = true;
      front.userData.role = 'facepaint-front';
      group.add(front);
      const inner = new THREE.Mesh(
        maskGeometry,
        material(0x8b7b61, {
          roughness: 0.72,
          metalness: 0.02,
          side: THREE.BackSide,
          emissive: 0x0d0906,
          emissiveIntensity: 0.04,
        })
      );
      inner.userData.role = 'plain-concave-inner';
      inner.scale.set(0.996, 0.996, 0.996);
      group.add(inner);
      return group;
    });
  }

  function addLighting() {
    scene.add(new THREE.HemisphereLight(0xe6f5eb, 0x07080b, 0.28));
    const key = new THREE.DirectionalLight(0xf2e8d5, 0.76);
    key.position.set(-3.4, 7.4, 4.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);

    const rimBlue = new THREE.PointLight(0x20d7e8, 1.25, 20);
    rimBlue.position.set(5.8, 2.2, 1.8);
    scene.add(rimBlue);

    const operaRed = new THREE.PointLight(0xd92d20, 1.1, 14);
    operaRed.position.set(-5.6, 2.1, -4.4);
    scene.add(operaRed);

    [-5.8, -3.2, 0, 3.2, 5.8].forEach((x, index) => {
      const spot = new THREE.SpotLight(index % 2 ? 0xe6f5eb : 0xf2d184, 0.82, 14, Math.PI / 9, 0.42, 1.4);
      spot.position.set(x, 4.6, 2.8);
      spot.target.position.set(x * 0.34, 0.9, -2.4);
      spot.castShadow = true;
      scene.add(spot);
      scene.add(spot.target);
    });
  }

  function addArchitecture() {
    const floorTexture = createPolishedFloorTexture();
    floorTexture.repeat.set(4, 4);
    const floorMat = physicalMaterial(0x15120f, { roughness: 0.18, metalness: 0.18, clearcoat: 0.78, clearcoatRoughness: 0.16 });
    floorMat.map = floorTexture;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 18.5), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -2.05;
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = physicalMaterial(0x1b1e19, { roughness: 0.58, metalness: 0.04, clearcoat: 0.18, side: THREE.DoubleSide });
    const accentWallMat = physicalMaterial(0x12342f, { roughness: 0.56, metalness: 0.04, clearcoat: 0.12, side: THREE.DoubleSide });
    const darkWallMat = physicalMaterial(0x101010, { roughness: 0.6, metalness: 0.06, side: THREE.DoubleSide });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 4.7), wallMat);
    backWall.position.set(0, 2.36, -10.95);
    scene.add(backWall);
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 4.7), accentWallMat);
    leftWall.position.set(-8.75, 2.36, -2.05);
    leftWall.rotation.y = Math.PI / 2;
    scene.add(leftWall);
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 4.7), darkWallMat);
    rightWall.position.set(8.75, 2.36, -2.05);
    rightWall.rotation.y = -Math.PI / 2;
    scene.add(rightWall);

    const rearRoom = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.5, 0.2), physicalMaterial(0x4d1d16, { roughness: 0.48, metalness: 0.08, emissive: 0x1a0805, emissiveIntensity: 0.16 }));
    rearRoom.position.set(0, 1.92, -10.82);
    scene.add(rearRoom);
    addTexturedPanel(
      createWallCopyTexture('AI 变脸中枢', ['Face Mesh 468 点', 'UV 纹样映射', 'RAG 文化关系']),
      2.2,
      1.48,
      [0, 2.02, -10.68],
      0
    );

    addSlatCeiling();
    addFlowerCeilingLight();
    addWallShowcases();
    addRearPortal();
    addSlatScreen();
    addGuidedFloorLight();

    addCultureWall();
    addUvLab();
  }

  function addSlatCeiling() {
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(17.8, 18.8), material(0x08090a, { roughness: 0.68, metalness: 0.05, side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.74, -2.05);
    scene.add(ceiling);

    const slatMat = physicalMaterial(0x18140f, { roughness: 0.44, metalness: 0.12, clearcoat: 0.32 });
    for (let x = -8.4; x <= 8.4; x += 0.24) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 18.6), slatMat);
      slat.position.set(x, 4.68, -2.05);
      scene.add(slat);
    }
  }

  function addFlowerCeilingLight() {
    const group = new THREE.Group();
    group.position.set(0, 4.56, -2.35);
    const petalTexture = createCeilingLightTexture('川剧图谱');
    const petalMat = new THREE.MeshBasicMaterial({ map: petalTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.96 });
    petalMat.depthWrite = false;
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x0b1720, side: THREE.DoubleSide });
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xd7a84a, side: THREE.DoubleSide });

    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const border = new THREE.Mesh(new THREE.CircleGeometry(1, 64), borderMat);
      border.scale.set(1.62, 0.58, 1);
      border.rotation.z = angle;
      border.position.set(Math.cos(angle) * 1.9, Math.sin(angle) * 1.9, 0.024);
      group.add(border);

      const petal = new THREE.Mesh(new THREE.CircleGeometry(1, 64), petalMat);
      petal.scale.set(1.48, 0.48, 1);
      petal.rotation.z = angle;
      petal.position.set(Math.cos(angle) * 1.9, Math.sin(angle) * 1.9, -0.014);
      petal.renderOrder = 2;
      group.add(petal);

      const rib = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.045, 0.02), goldMat);
      rib.rotation.z = angle;
      rib.position.set(Math.cos(angle) * 0.96, Math.sin(angle) * 0.96, -0.03);
      rib.renderOrder = 3;
      group.add(rib);
    }

    const centerBorder = new THREE.Mesh(new THREE.CircleGeometry(0.78, 96), borderMat);
    centerBorder.position.z = 0.018;
    group.add(centerBorder);
    const center = new THREE.Mesh(new THREE.CircleGeometry(0.62, 96), new THREE.MeshBasicMaterial({ map: createCeilingLightTexture('AI'), side: THREE.DoubleSide }));
    center.position.z = -0.04;
    center.renderOrder = 4;
    group.add(center);
    group.rotation.x = -Math.PI / 2;
    scene.add(group);

    const light = new THREE.PointLight(0xf2e8d5, 2.4, 11);
    light.position.set(0, 4.18, -2.35);
    scene.add(light);
  }

  function addWallShowcases() {
    const caseMat = physicalMaterial(0x0c0d0d, { roughness: 0.24, metalness: 0.2, clearcoat: 0.46 });
    const glassMat = createGlassMaterial(0.16);
    const shelfLight = new THREE.MeshBasicMaterial({ color: 0xf2e8d5, transparent: true, opacity: 0.82 });

    const leftCase = new THREE.Group();
    leftCase.position.set(-8.62, 1.62, -4.1);
    leftCase.rotation.y = Math.PI / 2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.0, 0.18), caseMat);
    leftCase.add(back);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.0, 0.16), glassMat);
    glass.position.z = 0.1;
    leftCase.add(glass);
    for (let i = 0; i < 4; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.035, 0.24), shelfLight);
      shelf.position.set(-1.75 + i * 1.15, -0.42 + (i % 2) * 0.36, 0.24);
      leftCase.add(shelf);
      const mini = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 32), material(i % 2 ? 0xd7a84a : 0xf2e8d5, { roughness: 0.46, metalness: 0.16 }));
      mini.position.set(shelf.position.x, shelf.position.y + 0.28, 0.3);
      leftCase.add(mini);
    }
    scene.add(leftCase);

    const rightPanel = createWallCopyTexture('脸谱知识库', ['角色  颜色  纹样', '寓意  剧目  故事', 'GraphRAG 关系检索']);
    addTexturedPanel(rightPanel, 1.64, 1.12, [8.56, 1.82, -5.6], -Math.PI / 2);

    const patternColors = ['#d92d20', '#20d7e8', '#d7a84a'];
    patternColors.forEach((color, index) => {
      addTexturedPanel(
        createMaskPatternTexture(['红脸', '蓝脸', '金脸'][index], color),
        0.72,
        0.72,
        [-8.64, 2.1, 0.35 + index * 1.04],
        Math.PI / 2
      );
    });
  }

  function addRearPortal() {
    const portal = new THREE.Group();
    portal.position.set(0, 1.72, -10.58);
    const frameMat = physicalMaterial(0x0b0b0c, { roughness: 0.28, metalness: 0.22, clearcoat: 0.4 });
    const goldMat = physicalMaterial(0xd7a84a, { roughness: 0.34, metalness: 0.45, clearcoat: 0.32, emissive: 0x301b02, emissiveIntensity: 0.08 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.42, 0.16), frameMat);
    left.position.x = -1.72;
    const right = left.clone();
    right.position.x = 1.72;
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.56, 0.12, 0.16), frameMat);
    top.position.y = 1.74;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.055, 0.18), goldMat);
    lintel.position.y = 1.36;
    portal.add(left, right, top, lintel);
    scene.add(portal);

    const warmPatch = createFloorReflectionPatch(2.8, 2.6, 0xd7a84a, 0.08);
    warmPatch.position.set(0, 0.019, -8.55);
    scene.add(warmPatch);
  }

  function addSlatScreen() {
    const group = new THREE.Group();
    group.position.set(8.55, 2.05, -0.3);
    const slatMat = physicalMaterial(0x6e3b22, { roughness: 0.44, metalness: 0.12, clearcoat: 0.22 });
    for (let i = 0; i < 24; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.055, 3.75, 0.08), slatMat);
      slat.position.set(0, 0, -2.2 + i * 0.18);
      group.add(slat);
    }
    scene.add(group);
  }

  function addGuidedFloorLight() {
    const cyan = new THREE.MeshBasicMaterial({ color: 0x20d7e8, transparent: true, opacity: 0.46 });
    const gold = new THREE.MeshBasicMaterial({ color: 0xd7a84a, transparent: true, opacity: 0.36 });
    [
      [-4.8, -7.5, 3.4, 0.035, cyan],
      [4.8, -7.5, 3.4, 0.035, gold],
      [0, -5.0, 7.0, 0.025, gold],
    ].forEach(([x, z, length, width, mat]) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, length), mat);
      line.position.set(x, 0.016, z);
      scene.add(line);
    });

    const cyanPatch = createFloorReflectionPatch(2.2, 4.6, 0x20d7e8, 0.045);
    cyanPatch.position.set(-4.6, 0.02, -4.0);
    scene.add(cyanPatch);
    const redPatch = createFloorReflectionPatch(2.4, 4.2, 0xd92d20, 0.04);
    redPatch.position.set(4.8, 0.021, -4.4);
    scene.add(redPatch);
  }

  function createLantern() {
    const group = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), material(0xd92d20, { roughness: 0.42, metalness: 0.05, emissive: 0x5a0808, emissiveIntensity: 0.22 }));
    shade.scale.y = 1.22;
    group.add(shade);
    const capMat = material(0xd7a84a, { roughness: 0.32, metalness: 0.48 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.04, 20), capMat);
    top.position.y = 0.29;
    const bottom = top.clone();
    bottom.position.y = -0.29;
    group.add(top, bottom);
    const light = new THREE.PointLight(0xf0a45c, 0.45, 2.8);
    group.add(light);
    return group;
  }

  function addUvLab() {
    const gridTexture = createGridTexture();
    gridTexture.repeat.set(1.2, 1.2);
    const materialGrid = new THREE.MeshStandardMaterial({
      map: gridTexture,
      color: 0xffffff,
      roughness: 0.54,
      metalness: 0.08,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      emissive: 0x062c31,
      emissiveIntensity: 0.16,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 2.28), materialGrid);
    panel.position.set(-8.58, 1.86, -7.45);
    panel.rotation.y = Math.PI / 2;
    scene.add(panel);

    const wires = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x20d7e8, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 9; i++) {
      const y = -0.9 + i * 0.225;
      const points = [
        new THREE.Vector3(-1.02, y, 0.02),
        new THREE.Vector3(-0.34, y + Math.sin(i) * 0.1, 0.02),
        new THREE.Vector3(0.32, y - Math.cos(i) * 0.1, 0.02),
        new THREE.Vector3(1.02, y, 0.02),
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(32));
      wires.add(new THREE.Line(geometry, lineMat));
    }
    wires.position.copy(panel.position);
    wires.rotation.copy(panel.rotation);
    scene.add(wires);
    uvPulse = wires;
  }

  function addCultureWall() {
    const group = new THREE.Group();
    group.position.set(8.56, 1.72, -2.78);
    group.rotation.y = -Math.PI / 2;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.1), material(0x0b1418, { roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide }));
    group.add(panel);
    const nodes = [
      [-0.8, 0.52, '#d92d20'], [0.2, 0.74, '#d7a84a'], [0.75, 0.24, '#20d7e8'],
      [-0.34, -0.1, '#f2e8d5'], [0.52, -0.54, '#40a66b'], [-0.95, -0.58, '#3155cc'],
    ];
    const dotMat = nodes.map((node) => material(parseInt(node[2].slice(1), 16), { roughness: 0.32, metalness: 0.18, emissive: parseInt(node[2].slice(1), 16), emissiveIntensity: 0.16 }));
    nodes.forEach((node, index) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 12), dotMat[index]);
      dot.position.set(node[0], node[1], 0.04);
      group.add(dot);
    });
    const lineMat = new THREE.LineBasicMaterial({ color: 0xd7a84a, transparent: true, opacity: 0.44 });
    for (let i = 0; i < nodes.length - 1; i++) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(nodes[i][0], nodes[i][1], 0.035),
        new THREE.Vector3(nodes[i + 1][0], nodes[i + 1][1], 0.035),
      ]);
      group.add(new THREE.Line(geometry, lineMat));
    }
    scene.add(group);
  }

  function parseObj(text) {
    const vertices = [];
    const uvs = [];
    const faces = [];
    String(text || '').split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;
      const parts = line.split(/\s+/);
      if (parts[0] === 'v' && parts.length >= 4) {
        vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
      } else if (parts[0] === 'vt' && parts.length >= 3) {
        uvs.push([Number(parts[1]), Number(parts[2])]);
      } else if (parts[0] === 'f' && parts.length >= 4) {
        const tokens = parts.slice(1).map((token) => {
          const values = token.split('/');
          return {
            v: resolveObjIndex(values[0], vertices.length),
            vt: values[1] ? resolveObjIndex(values[1], uvs.length) : -1,
          };
        }).filter((token) => token.v >= 0);
        for (let i = 1; i < tokens.length - 1; i++) faces.push([tokens[0], tokens[i], tokens[i + 1]]);
      }
    });
    if (!vertices.length || !faces.length) throw new Error('OBJ has no usable geometry');
    return buildGeometry(vertices, uvs, faces);
  }

  function resolveObjIndex(value, size) {
    const index = Number.parseInt(value, 10);
    if (!Number.isFinite(index) || index === 0) return -1;
    return index < 0 ? size + index : index - 1;
  }

  function buildGeometry(vertices, uvs, faces) {
    const mins = [Infinity, Infinity, Infinity];
    const maxs = [-Infinity, -Infinity, -Infinity];
    vertices.forEach((vertex) => {
      for (let axis = 0; axis < 3; axis++) {
        mins[axis] = Math.min(mins[axis], vertex[axis]);
        maxs[axis] = Math.max(maxs[axis], vertex[axis]);
      }
    });
    const center = [(mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, (mins[2] + maxs[2]) / 2];
    const scale = Math.max(maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2], 1e-6);
    const positions = new Float32Array(faces.length * 9);
    const uvArray = new Float32Array(faces.length * 6);
    let pi = 0;
    let ui = 0;
    faces.forEach((face) => {
      face.forEach((token) => {
        const vertex = vertices[token.v];
        positions[pi++] = (vertex[0] - center[0]) / scale;
        positions[pi++] = (vertex[1] - center[1]) / scale;
        positions[pi++] = (vertex[2] - center[2]) / scale;
        if (token.vt >= 0 && token.vt < uvs.length) {
          const uv = uvs[token.vt];
          uvArray[ui++] = uv[0];
          uvArray[ui++] = 1.0 - uv[1];
        } else {
          uvArray[ui++] = (vertex[0] - mins[0]) / Math.max(maxs[0] - mins[0], 1e-6);
          uvArray[ui++] = 1.0 - ((vertex[1] - mins[1]) / Math.max(maxs[1] - mins[1], 1e-6));
        }
      });
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }

  function fallbackMaskGeometry() {
    const geometry = new THREE.SphereGeometry(0.54, 48, 32, 0, Math.PI * 2, 0.22, Math.PI * 0.72);
    geometry.scale(0.78, 1.12, 0.22);
    geometry.computeVertexNormals();
    return geometry;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function createAlignedFacepaintTexture(image) {
    const size = 1024;
    const fit = { scaleX: 1.16, scaleY: 1.06, offsetX: 0, offsetY: -0.035 };
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const base = Math.min(size / image.width, size / image.height);
    const width = image.width * base * fit.scaleX;
    const height = image.height * base * fit.scaleY;
    const x = (size - width) / 2 + size * fit.offsetX;
    const y = (size - height) / 2 + size * fit.offsetY;
    ctx.drawImage(image, x, y, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.encoding = THREE.sRGBEncoding;
    texture.needsUpdate = true;
    return texture;
  }

  async function createMaskMaterial(face) {
    try {
      const image = await loadImage(face.image);
      const texture = createAlignedFacepaintTexture(image);
      return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.44,
        metalness: 0.06,
        side: THREE.FrontSide,
      });
    } catch (error) {
      textureState.textContent = 'TEXTURE FALLBACK';
      return material(0xd92d20, { roughness: 0.5, metalness: 0.08, side: THREE.FrontSide });
    }
  }

  async function addMaskExhibits(maskGeometry) {
    const placements = [
      { index: 0, pos: [0, 0, -5.45], look: [0, 1.15, 2.2], width: 1.55, depth: 1.55, scale: 1.18, main: true },
      { index: 1, pos: [-3.55, 0, -6.55], look: [0, 1.1, 0.8], width: 1.28, depth: 1.28, scale: 0.86 },
      { index: 2, pos: [3.55, 0, -6.55], look: [0, 1.1, 0.8], width: 1.28, depth: 1.28, scale: 0.86 },
      { index: 3, pos: [-5.95, 0, -3.45], look: [0, 1.05, 0.2], width: 1.2, depth: 1.2, scale: 0.8 },
      { index: 4, pos: [5.95, 0, -3.45], look: [0, 1.05, 0.2], width: 1.2, depth: 1.2, scale: 0.8 },
      { index: 5, pos: [-3.9, 0, -0.65], look: [0, 1.05, 1.6], width: 1.16, depth: 1.16, scale: 0.74 },
      { index: 6, pos: [3.9, 0, -0.65], look: [0, 1.05, 1.6], width: 1.16, depth: 1.16, scale: 0.74 },
      { index: 7, pos: [-6.3, 0, -7.9], look: [0, 1.0, -4.8], width: 1.08, depth: 1.08, scale: 0.7 },
      { index: 8, pos: [6.3, 0, -7.9], look: [0, 1.0, -4.8], width: 1.08, depth: 1.08, scale: 0.7 },
      { index: 9, pos: [0, 0, -1.58], look: [0, 1.2, 3.0], width: 1.26, depth: 1.26, scale: 0.82 },
    ];

    for (const placement of placements) {
      const index = placement.index;
      const face = faces[index];
      const exhibit = createDisplayCase({
        width: placement.width,
        depth: placement.depth,
        glassHeight: placement.main ? 2.18 : 1.78,
        baseHeight: placement.main ? 0.7 : 0.56,
        top: true,
      });
      exhibit.position.set(...placement.pos);
      exhibit.lookAt(new THREE.Vector3(...placement.look));

      let maskRoot = null;
      if (!placement.main) {
        maskRoot = await createMuseumMaskObject(maskGeometry, face, placement.scale);
        maskRoot.position.y = 1.34;
        maskRoot.position.z = 0.08;
        exhibit.add(maskRoot);
      }

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(placement.main ? 0.78 : 0.58, 0.016, 12, 96),
        material(0xd7a84a, { roughness: 0.28, metalness: 0.58, emissive: 0x3d2505, emissiveIntensity: 0.1 })
      );
      halo.position.set(0, placement.main ? 1.68 : 1.34, -0.08);
      exhibit.add(halo);

      const labelTexture = createLabelTexture(face.title, face.role);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(placement.main ? 1.06 : 0.78, placement.main ? 0.34 : 0.25),
        new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, side: THREE.DoubleSide })
      );
      label.position.set(0, placement.main ? 0.95 : 0.76, placement.depth * 0.5 + 0.05);
      exhibit.add(label);

      exhibit.userData = { face, maskRoot, index };
      if (maskRoot) maskGroups.push(exhibit);
      scene.add(exhibit);
    }
  }

  async function createFeaturedMask(maskGeometry) {
    featuredMask = new THREE.Group();
    featuredMask.position.set(0, 1.54, -5.45);
    featuredMask.scale.set(1.58, 1.58, 1.58);
    const maskRoot = await createMuseumMaskObject(maskGeometry, faces[0], 1);
    maskRoot.userData.role = 'featured-mask-root';
    featuredMask.add(maskRoot);
    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.018, 16, 128),
      material(0x20d7e8, { roughness: 0.28, metalness: 0.42, emissive: 0x0a4850, emissiveIntensity: 0.24 })
    );
    aura.position.z = -0.08;
    featuredMask.add(aura);
    scene.add(featuredMask);
  }

  async function updateFeaturedMask(index) {
    selectedIndex = index;
    const face = faces[index] || faces[0];
    if (featuredMask) {
      const root = featuredMask.children.find((child) => child.userData?.role === 'featured-mask-root');
      const front = root?.children?.find((child) => child.userData?.role === 'facepaint-front');
      if (front) {
        if (front.material?.map) front.material.map.dispose();
        front.material = await createMaskMaterial(face);
      }
    }
    activeMaskTitle.textContent = `${face.title} · ${face.role}`;
    activeMaskCopy.textContent = `${face.meaning}。当前展厅用个人 OBJ 模型承载该脸谱的 UV 贴图，作为个性化三维脸谱展品展示。`;
    Array.from(maskStrip.children).forEach((button, buttonIndex) => {
      button.classList.toggle('is-selected', buttonIndex === index);
    });
  }

  function buildMaskStrip() {
    faces.forEach((face, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = face.title;
      button.addEventListener('click', () => updateFeaturedMask(index));
      maskStrip.appendChild(button);
    });
  }

  function addDeterministicParticles() {
    const count = 760;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = i * 2.399963229728653;
      const radius = 1.2 + 6.6 * Math.sqrt(t);
      const wave = Math.sin(i * 0.137) * 0.35;
      positions[i * 3] = Math.cos(angle) * radius * 0.82;
      positions[i * 3 + 1] = 1.85 + (i % 31) * 0.074 + wave * 0.18;
      positions[i * 3 + 2] = Math.sin(angle) * radius - 2.5;
      const warm = (i % 5) / 5;
      colors[i * 3] = 0.55 + warm * 0.36;
      colors[i * 3 + 1] = 0.5 + warm * 0.32;
      colors[i * 3 + 2] = 0.42 + (1 - warm) * 0.25;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pointCloud = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 0.014, vertexColors: true, transparent: true, opacity: 0.26, depthWrite: false })
    );
    scene.add(pointCloud);
  }

  function moveCamera(delta) {
    const speed = 2.8 * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const move = new THREE.Vector3();
    if (keys.has('w')) move.add(forward);
    if (keys.has('s')) move.sub(forward);
    if (keys.has('d')) move.add(right);
    if (keys.has('a')) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
      controls.target.add(move);
    }
  }

  function setView(view) {
    const views = {
      gate: { pos: [0, 1.72, 7.8], target: [0, 1.52, -5.2] },
      ritual: { pos: [0.25, 1.82, 2.6], target: [0, 1.56, -5.45] },
      'mask-wall': { pos: [6.9, 1.9, -0.8], target: [2.8, 1.36, -5.9] },
      'uv-lab': { pos: [-7.25, 1.96, -1.4], target: [-4.9, 1.75, -2.0] },
      archive: { pos: [7.25, 2.02, -2.2], target: [5.0, 1.6, -2.0] },
    };
    if (view === 'classic') return;
    const target = views[view];
    if (!target) return;
    camera.position.set(...target.pos);
    controls.target.set(...target.target);
    controls.update();
  }

  async function loadManifest() {
    for (const url of [`/digital_exhibition/scenes/${sceneId}/scene_manifest.json`]) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) continue;
        const data = await response.json();
        sceneTitle.textContent = data.title || sceneTitle.textContent;
        sceneNote.textContent = data.description || data.claimLevel || sceneNote.textContent;
        return data;
      } catch (error) {
        // Try next.
      }
    }
    return null;
  }

  async function init() {
    addLighting();
    addArchitecture();
    addDeterministicParticles();
    buildMaskStrip();
    await loadManifest();

    let geometry = fallbackMaskGeometry();
    try {
      const response = await fetch(personalObjUrl, { cache: 'no-store' });
      if (response.ok) {
        geometry = parseObj(await response.text());
        modelSource.textContent = 'personal_face.obj';
      } else {
        modelSource.textContent = 'fallback-mask';
      }
    } catch (error) {
      modelSource.textContent = 'fallback-mask';
    }

    await addMaskExhibits(geometry);
    await createFeaturedMask(geometry);
    await updateFeaturedMask(0);

    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.view));
    });
    animate();
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    moveCamera(delta);
    controls.update();
    if (featuredMask) {
      featuredMask.rotation.y = Math.sin(elapsed * 0.38) * 0.28;
      featuredMask.position.y = 1.54 + Math.sin(elapsed * 0.9) * 0.025;
    }
    maskGroups.forEach((group, index) => {
      if (group.userData.maskRoot) {
        group.userData.maskRoot.rotation.y = Math.sin(elapsed * 0.42 + index) * 0.08;
      }
    });
    if (pointCloud) pointCloud.rotation.y += delta * 0.018;
    if (uvPulse) uvPulse.children.forEach((line, index) => {
      line.material.opacity = 0.22 + Math.abs(Math.sin(elapsed * 1.2 + index * 0.42)) * 0.42;
    });
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  init();
})();
