import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const ASSET_ROOT = '/3dgs/backgrounds';

const SCENES = {
  huaqingchi: {
    id: 'huaqingchi',
    label: '华清池',
    location: '长安宫苑',
    description: '近景廊檐、水面与山体层次更明显，沉浸感更强。',
    manifest: 'huaqingchi.manifest.json',
  },
  leifengta: {
    id: 'leifengta',
    label: '西湖·雷峰塔',
    location: '杭州西湖',
    description: '远景塔影、湖面与林带舒展开阔，视角变化更柔和。',
    manifest: 'leifengta.manifest.json',
  },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function supportsWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    }));
  } catch {
    return false;
  }
}

class ImmersiveBackgroundController {
  constructor() {
    this.button = document.getElementById('immersiveBtn');
    this.buttonLabel = this.button?.querySelector('[data-immersive-button-label]');
    this.panel = document.getElementById('immersiveScenePanel');
    this.panelClose = document.getElementById('immersivePanelClose');
    this.disableButton = document.getElementById('immersiveDisableBtn');
    this.panelStatus = document.getElementById('immersivePanelStatus');
    this.layer = document.getElementById('immersiveBackgroundLayer');
    this.host = document.getElementById('immersiveSplatHost');
    this.poster = document.getElementById('immersiveFallbackPoster');
    this.previewVideo = document.getElementById('immersiveFallbackVideo');
    this.viewportStatus = document.getElementById('immersiveViewportStatus');
    this.viewportStatusTitle = this.viewportStatus?.querySelector('[data-immersive-status-title]');
    this.viewportStatusDetail = this.viewportStatus?.querySelector('[data-immersive-status-detail]');
    this.stage = document.querySelector('.video-inner');
    this.sceneButtons = Array.from(document.querySelectorAll('[data-immersive-scene]'));

    this.viewer = null;
    this.viewerRoot = null;
    this.activeSceneId = null;
    this.manifest = null;
    this.loadGeneration = 0;
    this.rafId = 0;
    this.lastRenderAt = 0;
    this.frameInterval = this.getFrameInterval();
    this.pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.cameraAmplitude = { x: 0.18, y: 0.1 };
    this.webGL2Available = supportsWebGL2();
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!this.button || !this.panel || !this.layer || !this.host || !this.stage) return;

    this.tick = this.tick.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.bindEvents();
    this.setState('idle', '选择一处景致，进入画中舞台。');
  }

  getFrameInterval() {
    const memory = Number(navigator.deviceMemory || 8);
    const cores = Number(navigator.hardwareConcurrency || 8);
    return memory <= 4 || cores <= 4 ? 50 : 33;
  }

  bindEvents() {
    if (!window.__aiOperaImmersiveBootstrap) {
      this.button.addEventListener('click', () => this.togglePanel());
      this.panelClose?.addEventListener('click', () => this.togglePanel(false));
      this.disableButton?.addEventListener('click', () => this.deactivate());

      this.sceneButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const sceneId = button.dataset.immersiveScene;
          if (sceneId) void this.activate(sceneId);
        });
      });
    }

    this.stage.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.stage.addEventListener('pointerleave', this.onPointerLeave, { passive: true });

    window.addEventListener('resize', () => this.scheduleFrame(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.scheduleFrame();
    });
    if (!window.__aiOperaImmersiveBootstrap) {
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.panel.classList.contains('is-visible')) {
          this.togglePanel(false);
        }
      });
    }
    window.addEventListener('pagehide', () => {
      this.loadGeneration += 1;
      void this.disposeViewer();
    });
  }

  togglePanel(force) {
    const shouldOpen = typeof force === 'boolean'
      ? force
      : !this.panel.classList.contains('is-visible');

    this.panel.classList.toggle('is-visible', shouldOpen);
    this.panel.setAttribute('aria-hidden', String(!shouldOpen));
    this.button.setAttribute('aria-expanded', String(shouldOpen));

    if (shouldOpen) {
      this.panel.querySelector('[data-immersive-scene]')?.focus({ preventScroll: true });
      this.panel.scrollIntoView({ behavior: this.prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest' });
    } else {
      this.button.focus({ preventScroll: true });
    }
  }

  async activate(sceneId) {
    const scene = SCENES[sceneId];
    if (!scene) return;

    if (this.activeSceneId === sceneId && (this.viewer || this.layer.classList.contains('is-fallback'))) {
      this.togglePanel(false);
      return;
    }

    const generation = ++this.loadGeneration;
    this.activeSceneId = sceneId;
    this.selectSceneButton(sceneId);
    document.body.classList.add('immersive-active');
    this.layer.classList.add('is-visible', 'is-loading');
    this.layer.classList.remove('is-rendering', 'is-fallback', 'has-error');
    this.layer.setAttribute('aria-hidden', 'false');
    this.button.classList.add('is-active', 'is-loading');
    this.buttonLabel.textContent = `载入${scene.label}`;
    this.setState('loading', `正在载入${scene.label}的三维景深…`);

    if (this.poster) {
      this.poster.src = `${ASSET_ROOT}/${sceneId}.poster.jpeg`;
      this.poster.alt = `${scene.label}场景预览`;
    }
    this.stopFallbackVideo();

    try {
      const response = await fetch(`${ASSET_ROOT}/${scene.manifest}`);
      if (!response.ok) throw new Error(`场景参数读取失败：HTTP ${response.status}`);
      const manifest = await response.json();
      if (generation !== this.loadGeneration) return;

      this.manifest = manifest;
      this.cameraAmplitude = this.computeCameraAmplitude(manifest);
      await this.disposeViewer();
      if (generation !== this.loadGeneration) return;

      if (!this.webGL2Available) {
        throw new Error('当前浏览器未启用 WebGL2');
      }

      const canUseSharedMemory = Boolean(window.crossOriginIsolated && window.SharedArrayBuffer);
      const viewerRoot = document.createElement('div');
      viewerRoot.className = 'immersive-splat-root';
      Object.assign(viewerRoot.style, { position: 'absolute', inset: '0' });
      this.host.replaceChildren(viewerRoot);
      this.viewerRoot = viewerRoot;
      const viewer = new GaussianSplats3D.Viewer({
        rootElement: viewerRoot,
        cameraUp: [0, -1, 0],
        initialCameraPosition: [0, 0, 0],
        initialCameraLookAt: [0, 0, 1],
        selfDrivenMode: false,
        useBuiltInControls: false,
        ignoreDevicePixelRatio: true,
        gpuAcceleratedSort: canUseSharedMemory,
        enableSIMDInSort: true,
        sharedMemoryForWorkers: canUseSharedMemory,
        integerBasedSort: true,
        halfPrecisionCovariancesOnGPU: true,
        dynamicScene: false,
        renderMode: GaussianSplats3D.RenderMode.OnChange,
        sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
        antialiased: false,
        sphericalHarmonicsDegree: 0,
        enableOptionalEffects: false,
        optimizeSplatData: true,
        inMemoryCompressionLevel: 2,
        freeIntermediateSplatData: true,
        logLevel: GaussianSplats3D.LogLevel.None,
      });

      this.viewer = viewer;
      await viewer.addSplatScene(`${ASSET_ROOT}/${manifest.scene}`, {
        format: GaussianSplats3D.SceneFormat.KSplat,
        splatAlphaRemovalThreshold: 5,
        showLoadingUI: false,
        progressiveLoad: false,
      });

      if (generation !== this.loadGeneration) {
        await this.disposeViewer();
        return;
      }

      this.resetPointer(false);
      this.applyCamera();
      viewer.update();
      viewer.render();

      this.layer.classList.remove('is-loading', 'is-fallback', 'has-error');
      this.layer.classList.add('is-rendering');
      this.button.classList.remove('is-loading');
      this.button.classList.add('is-active');
      this.buttonLabel.textContent = `身临其境 · ${scene.label}`;
      this.setState('ready', '移动鼠标，轻轻改变观景视角。');
      window.setTimeout(() => this.togglePanel(false), 420);
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      console.warn('[immersive-background] WebGL scene fallback:', error);
      await this.useFallback(scene);
    }
  }

  computeCameraAmplitude(manifest) {
    const imageSize = manifest.imageSize || [448, 320];
    const focal = Number(manifest.camera?.intrinsic?.[0] || 390);
    const maxSceneDisparity = Math.max(Number(manifest.camera?.disparity?.[1] || 0.1), 0.0001);
    const nearestDepth = 1 / maxSceneDisparity;
    const normalizedDiagonal = Math.hypot(imageSize[0] / focal, imageSize[1] / focal);
    const requestedDisparity = Number(manifest.interaction?.maxDisparity || 0.04);
    const x = clamp(requestedDisparity * normalizedDiagonal * nearestDepth, 0.08, 1.8);
    return {
      x: this.prefersReducedMotion ? x * 0.35 : x,
      y: this.prefersReducedMotion ? x * 0.16 : x * 0.48,
    };
  }

  async useFallback(scene) {
    await this.disposeViewer();
    this.layer.classList.remove('is-loading', 'is-rendering', 'has-error');
    this.layer.classList.add('is-fallback');
    this.button.classList.remove('is-loading');
    this.button.classList.add('is-active');
    this.buttonLabel.textContent = `身临其境 · ${scene.label}`;

    if (this.previewVideo) {
      this.previewVideo.src = `${ASSET_ROOT}/${scene.id}.preview.mp4`;
      this.previewVideo.hidden = false;
      this.previewVideo.muted = true;
      this.previewVideo.loop = true;
      this.previewVideo.playsInline = true;
      await this.previewVideo.play().catch(() => {});
    }

    this.setState('fallback', '已切换轻量动态预览；移动鼠标仍有柔和视差。');
    window.setTimeout(() => this.togglePanel(false), 420);
    this.scheduleFrame();
  }

  async deactivate() {
    this.loadGeneration += 1;
    this.activeSceneId = null;
    this.manifest = null;
    document.body.classList.remove('immersive-active');
    this.layer.classList.remove('is-visible', 'is-loading', 'is-rendering', 'is-fallback', 'has-error');
    this.layer.setAttribute('aria-hidden', 'true');
    this.button.classList.remove('is-active', 'is-loading');
    this.buttonLabel.textContent = '身临其境';
    this.selectSceneButton(null);
    this.stopFallbackVideo();
    this.resetPointer(false);
    this.togglePanel(false);
    this.setState('idle', '已恢复原有舞台背景。');
    await this.disposeViewer();
  }

  async disposeViewer() {
    const viewer = this.viewer;
    const viewerRoot = this.viewerRoot;
    this.viewer = null;
    this.viewerRoot = null;
    if (!viewer) {
      viewerRoot?.remove();
      this.host.replaceChildren();
      return;
    }

    try {
      // The library always removes its root from document.body during dispose.
      // Give it an owned wrapper there briefly so it never touches our stage host.
      if (viewerRoot && viewerRoot.parentElement !== document.body) {
        viewerRoot.style.display = 'none';
        document.body.appendChild(viewerRoot);
      }
      await viewer.dispose();
    } catch (error) {
      console.warn('[immersive-background] Viewer cleanup warning:', error);
    } finally {
      viewerRoot?.remove();
      this.host.replaceChildren();
    }
  }

  stopFallbackVideo() {
    if (!this.previewVideo) return;
    this.previewVideo.pause();
    this.previewVideo.removeAttribute('src');
    this.previewVideo.load();
    this.previewVideo.hidden = true;
    this.previewVideo.style.transform = '';
  }

  selectSceneButton(sceneId) {
    this.sceneButtons.forEach((button) => {
      const selected = button.dataset.immersiveScene === sceneId;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (this.disableButton) this.disableButton.disabled = !sceneId;
  }

  setState(state, detail) {
    this.layer.dataset.state = state;
    if (this.panelStatus) this.panelStatus.textContent = detail;
    if (this.viewportStatusTitle) {
      this.viewportStatusTitle.textContent = state === 'loading'
        ? '场景载入中'
        : state === 'ready'
          ? SCENES[this.activeSceneId]?.label || '沉浸场景'
          : state === 'fallback'
            ? '轻量观景模式'
            : '沉浸背景';
    }
    if (this.viewportStatusDetail) this.viewportStatusDetail.textContent = detail;
  }

  onPointerMove(event) {
    if (!this.activeSceneId) return;
    const rect = this.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.targetX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    this.pointer.targetY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    this.scheduleFrame();
  }

  onPointerLeave() {
    if (!this.activeSceneId) return;
    this.pointer.targetX = 0;
    this.pointer.targetY = 0;
    this.scheduleFrame();
  }

  resetPointer(animate = true) {
    this.pointer.targetX = 0;
    this.pointer.targetY = 0;
    if (!animate) {
      this.pointer.x = 0;
      this.pointer.y = 0;
    }
    this.scheduleFrame();
  }

  scheduleFrame() {
    if (!this.activeSceneId || this.rafId || document.hidden) return;
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  tick(timestamp) {
    this.rafId = 0;
    if (!this.activeSceneId || document.hidden) return;

    const dx = this.pointer.targetX - this.pointer.x;
    const dy = this.pointer.targetY - this.pointer.y;
    const moving = Math.abs(dx) > 0.0015 || Math.abs(dy) > 0.0015;
    const easing = this.prefersReducedMotion ? 0.1 : 0.18;

    this.pointer.x += dx * easing;
    this.pointer.y += dy * easing;

    if (this.previewVideo && !this.previewVideo.hidden) {
      const tx = (-this.pointer.x * 1.2).toFixed(3);
      const ty = (-this.pointer.y * 0.8).toFixed(3);
      this.previewVideo.style.transform = `translate3d(${tx}%, ${ty}%, 0) scale(1.065)`;
    }

    if (this.viewer && timestamp - this.lastRenderAt >= this.frameInterval) {
      this.lastRenderAt = timestamp;
      this.applyCamera();
      this.viewer.update();
      this.viewer.render();
    }

    if (moving) this.scheduleFrame();
  }

  applyCamera() {
    const camera = this.viewer?.camera;
    if (!camera) return;
    const cameraX = this.pointer.x * this.cameraAmplitude.x;
    const cameraY = this.pointer.y * this.cameraAmplitude.y;
    camera.position.set(cameraX, cameraY, 0);
    camera.up.set(0, -1, 0);
    camera.lookAt(cameraX, cameraY, 1);
    camera.updateProjectionMatrix();
  }
}

function initializeImmersiveBackground() {
  const controller = new ImmersiveBackgroundController();
  window.aiOperaImmersiveBackground = {
    activate: (sceneId) => controller.activate(sceneId),
    deactivate: () => controller.deactivate(),
    getState: () => ({
      activeSceneId: controller.activeSceneId,
      renderer: controller.viewer ? '3dgs' : controller.activeSceneId ? 'fallback' : 'off',
    }),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeImmersiveBackground, { once: true });
} else {
  initializeImmersiveBackground();
}
