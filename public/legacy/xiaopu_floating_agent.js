(function () {
  if (window.__xiaopuFloatingAgentLoaded) return;
  window.__xiaopuFloatingAgentLoaded = true;

  if (window.top !== window.self) return;

  const state = {
    busy: false,
    opened: false,
    configured: false,
    lastSpeakableText: '',
  };

  function getBackendBaseUrl() {
    const host = window.location.hostname || '127.0.0.1';
    const inferred = `${window.location.protocol}//${host}:8000`;
    return String(window.HQ_MASK_BACKEND_BASE_URL || inferred).replace(/\/+$/, '');
  }

  function resolveFaceKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      if (typeof window.resolveFaceKnowledgeKey === 'function') {
        return window.resolveFaceKnowledgeKey(raw);
      }
    } catch (error) {
      // Face knowledge data may not be loaded on every page.
    }
    return raw
      .replace(/\.(png|jpg|jpeg|webp)$/i, '')
      .replace(/^.*[\\/]/, '')
      .toLowerCase();
  }

  function getFrameContext() {
    const iframe = document.querySelector('iframe');
    if (!iframe || !iframe.contentWindow) return {};
    try {
      const frameWindow = iframe.contentWindow;
      const client = frameWindow.backendMaskClient;
      const renderer = frameWindow.personalizedRenderer;
      const faceKey = client?.getTextureKey?.()
        || renderer?.faceTextureList?.[renderer?.currentTextureIndex || 0]
        || '';
      return {
        currentFaceKey: resolveFaceKey(faceKey),
        pageMode: frameWindow.__legacyMode || '',
        galleryCount: frameWindow.__faceGallery?.size || 0,
      };
    } catch (error) {
      return {};
    }
  }

  function getCurrentContext() {
    const custom = typeof window.__xiaopuGetContext === 'function' ? window.__xiaopuGetContext() : {};
    const frame = getFrameContext();
    const faceTitle = document.querySelector('#faceTitle')?.textContent || '';
    const faceMeta = document.querySelector('#faceMeta')?.textContent || '';
    const url = new URL(window.location.href);
    const faceParam = url.searchParams.get('face') || url.searchParams.get('title') || '';
    const currentFaceKey = custom.currentFaceKey
      || frame.currentFaceKey
      || resolveFaceKey(faceParam || faceTitle)
      || 'guanyu';

    return {
      pageTitle: document.title,
      pageUrl: window.location.pathname,
      currentFaceKey,
      faceTitle: custom.faceTitle || faceTitle || '',
      faceMeta: custom.faceMeta || faceMeta || '',
      pageMode: custom.pageMode || frame.pageMode || document.body.dataset.mode || '',
      galleryCount: custom.galleryCount ?? frame.galleryCount ?? '',
      extra: custom.extra || {},
    };
  }

  function canSpeak() {
    return typeof window.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  function speakText(text) {
    const content = String(text || '').replace(/[#*_`>-]/g, '').trim();
    if (!content || !canSpeak()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.92;
    utterance.pitch = 1.02;
    window.speechSynthesis.speak(utterance);
  }

  function sanitizeXiaopuText(text) {
    return String(text || '').replace(/[#*]/g, '').trim();
  }

  function createWidget() {
    const root = document.createElement('aside');
    root.className = 'xiaopu-floating-agent';
    root.innerHTML = `
      <button class="xiaopu-avatar-button" type="button" aria-label="打开小谱">
        <img src="/legacy/faces/张飞.png" alt="" aria-hidden="true">
        <span>小谱</span>
      </button>
      <section class="xiaopu-dialog" aria-live="polite" aria-label="小谱对话框">
        <header class="xiaopu-dialog-head">
          <div>
            <span>AI 导览</span>
            <strong>小谱</strong>
          </div>
          <button class="xiaopu-close-button" type="button" aria-label="关闭小谱">×</button>
        </header>
        <div class="xiaopu-status">在线</div>
        <div class="xiaopu-messages"></div>
        <form class="xiaopu-compose">
          <textarea rows="2" placeholder="问小谱：当前脸谱是谁？这个项目的 AI 功能如何工作？"></textarea>
          <button type="submit">发送</button>
        </form>
        <div class="xiaopu-actions">
          <button type="button" data-prompt="请解释当前脸谱的角色、颜色寓意和对应剧目。">解释当前脸谱</button>
          <button type="button" data-prompt="请用答辩口吻说明本项目里的 AI 价值。">AI 价值</button>
          <button type="button" data-speak="1">朗读</button>
        </div>
      </section>
    `;
    document.body.appendChild(root);
    return root;
  }

  const root = createWidget();
  const avatarButton = root.querySelector('.xiaopu-avatar-button');
  const closeButton = root.querySelector('.xiaopu-close-button');
  const statusEl = root.querySelector('.xiaopu-status');
  const messagesEl = root.querySelector('.xiaopu-messages');
  const form = root.querySelector('.xiaopu-compose');
  const input = root.querySelector('textarea');
  const sendButton = root.querySelector('.xiaopu-compose button');

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function now() {
    return window.performance?.now?.() || Date.now();
  }

  function addMessageMeta(item, meta) {
    if (!meta) return null;
    const metaEl = document.createElement('span');
    metaEl.className = 'xiaopu-message-meta';
    metaEl.textContent = meta;
    item.appendChild(metaEl);
    return metaEl;
  }

  function addMessage(role, text, meta, options = {}) {
    const item = document.createElement('div');
    item.className = `xiaopu-message ${role}${options.className ? ` ${options.className}` : ''}`;
    const displayText = role === 'user' ? String(text || '') : sanitizeXiaopuText(text);
    const body = document.createElement('div');
    body.className = 'xiaopu-message-body';
    body.textContent = displayText;
    item.appendChild(body);
    const metaEl = addMessageMeta(item, meta);
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (role === 'agent' && !options.skipSpeakable) state.lastSpeakableText = displayText;
    return { item, body, metaEl, displayText };
  }

  function addThinkingMessage() {
    const frames = ['.', '..', '...', '....', '.....', '......'];
    const refs = addMessage('agent', `正在思考中${frames[0]}`, '', {
      className: 'is-thinking',
      skipSpeakable: true,
    });
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % frames.length;
      refs.body.textContent = `正在思考中${frames[index]}`;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 260);
    return {
      ...refs,
      stop() {
        window.clearInterval(timer);
        refs.item.remove();
      },
    };
  }

  async function keepThinkingVisible(startedAt) {
    const minimumMs = 680;
    const remaining = minimumMs - (now() - startedAt);
    if (remaining > 0) await sleep(remaining);
  }

  function getTypingBatchSize(total) {
    if (total > 900) return 8;
    if (total > 520) return 5;
    if (total > 260) return 3;
    return 2;
  }

  function getTypingDelay(lastChar, total) {
    if (/[。！？!?]/.test(lastChar)) return total > 520 ? 92 : 138;
    if (/[，、；：,;:]/.test(lastChar)) return total > 520 ? 46 : 76;
    return total > 520 ? 18 : 26;
  }

  async function typeAgentMessage(text, meta) {
    const displayText = sanitizeXiaopuText(text) || '小谱暂未返回内容。';
    const refs = addMessage('agent', '', '', {
      className: 'is-typing',
      skipSpeakable: true,
    });
    const units = Array.from(displayText);
    const batchSize = getTypingBatchSize(units.length);
    for (let index = 0; index < units.length; index += batchSize) {
      const chunk = units.slice(index, index + batchSize).join('');
      refs.body.textContent += chunk;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      await sleep(getTypingDelay(chunk[chunk.length - 1] || '', units.length));
    }
    refs.item.classList.remove('is-typing');
    addMessageMeta(refs.item, meta);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    state.lastSpeakableText = displayText;
    return refs.item;
  }

  function normalizeModeLabel(data) {
    if (data.usedDeepSeek) return `DeepSeek 模型 ${data.model || 'model'}`;
    if (data.agentMode === 'local-rag') return '本地知识库';
    return data.agentMode || '本地知识库';
  }

  async function loadConfig() {
    if (state.configured) return;
    state.configured = true;
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/ai/config`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const config = await response.json();
      setStatus(config.deepseekConfigured ? `DeepSeek 模型 ${config.model}` : '本地知识库');
    } catch (error) {
      setStatus('后端未连接');
    }
  }

  function openDialog() {
    state.opened = true;
    root.classList.add('is-open');
    loadConfig();
    if (!messagesEl.children.length) {
      addMessage('agent', '我是小谱，你可以问我任何跟川剧相关的问题！', '在线');
    }
    window.setTimeout(() => input.focus(), 80);
  }

  function closeDialog() {
    state.opened = false;
    root.classList.remove('is-open');
  }

  async function askAgent(prompt) {
    const message = String(prompt || '').trim();
    if (!message || state.busy) return;
    state.busy = true;
    input.value = '';
    sendButton.disabled = true;
    addMessage('user', message);
    const thinkingStartedAt = now();
    const thinking = addThinkingMessage();
    setStatus('正在思考中');

    const context = getCurrentContext();
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/ai/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          currentFaceKey: context.currentFaceKey,
          uiContext: context,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const mode = normalizeModeLabel(data);
      await keepThinkingVisible(thinkingStartedAt);
      thinking.stop();
      setStatus(mode);
      await typeAgentMessage(data.answer || '小谱暂未返回内容。', mode);
    } catch (error) {
      await keepThinkingVisible(thinkingStartedAt);
      thinking.stop();
      setStatus('后端未连接');
      await typeAgentMessage('小谱后端暂时不可用。请确认后端服务已经启动，再回到这里提问。', '离线');
    } finally {
      state.busy = false;
      sendButton.disabled = false;
    }
  }

  avatarButton.addEventListener('click', () => {
    if (state.opened) {
      closeDialog();
    } else {
      openDialog();
    }
  });

  closeButton.addEventListener('click', closeDialog);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    askAgent(input.value);
  });

  root.querySelectorAll('.xiaopu-actions button').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.speak) {
        speakText(state.lastSpeakableText);
      } else {
        askAgent(button.dataset.prompt || '');
      }
    });
  });
})();
