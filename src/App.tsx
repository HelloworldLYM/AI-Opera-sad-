import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

type ExperienceMode = 'lite' | 'full'

const heroPosterSrc = '/legacy/main_poster_panel_v2.png'
const ambientMusicSrc = '/legacy/audio/opera-background.mp3'

const modeMeta: Record<
  ExperienceMode,
  {
    label: string
    tag: string
    description: string
    details: string[]
    stageLine: string
  }
> = {
  lite: {
    label: '轻云入戏',
    tag: '推荐首次体验',
    description: '画面更稳、更顺，适合大多数电脑和浏览器环境。',
    details: ['保留核心变脸、舞扇、吐火玩法', '陈列馆按需入藏，本次最多精选 6 张', '更适合首次体验或普通电脑'],
    stageLine: '动作反馈更轻快，第一次体验更容易进入状态。',
  },
  full: {
    label: '华彩入境',
    tag: '光效更完整',
    description: '舞台光影与层次更丰富，适合性能更强的设备。',
    details: ['保留完整舞台光影与氛围层次', '陈列馆自动入藏，本次最多收满 12 张', '适合性能更强的设备展示完整效果'],
    stageLine: '光效和舞台氛围更浓，适合想看完整效果时使用。',
  },
}

const showcaseCards = [
  {
    title: '挥手即变',
    body: '把手势从镜头前掠过，脸谱会顺着动作切换，开场就能立刻看到反馈。',
  },
  {
    title: '转头有戏',
    body: '转头、侧脸、抬头这些姿态变化都会被实时捕捉，让表演更有起承转合。',
  },
  {
    title: '舞扇变脸',
    body: '握拳把扇面抬到脸前，遮住大半张脸时，就会触发一记很有戏的扇下换容。',
  },
  {
    title: '逼真吐火',
    body: '侧头并举起同侧的手，镜头里会点亮火把与火焰，舞台感会一下子拉满。',
  },
]

const journeySteps = [
  '先选你想体验的模式，轻云更稳，华彩更震撼。',
  '滑到页面底部，找到舞台入口后点击进入。',
  '进入后允许相机权限，先试挥手、转头，再解锁扇面遮脸和吐火效果。',
]

const sceneTelemetry = [
  {
    label: '视觉感知',
    value: '镜头动作识别',
    body: '镜头输入与动作关键点实时驱动舞台反馈',
  },
  {
    label: '智能导览',
    value: '小谱导览',
    body: '结合脸谱知识库、当前角色和项目状态回答',
  },
  {
    label: '三维资产',
    value: '个人脸谱模型',
    body: '个人三维脸谱模型可旋转查看与展示',
  },
]

const moduleTiles = [
  {
    label: '实时体验',
    title: '镜头舞台',
    body: '手势、人脸姿态、扇面遮挡和吐火效果集中在正式体验馆里完成。',
    href: '/stage.html?mode=lite&entry=portal',
  },
  {
    label: '收藏馆',
    title: '脸谱与唱段',
    body: '按角色切换脸谱，同步匹配剧目唱段，并提供原视频检索入口。',
    href: '/digital_exhibition_viewer.html',
  },
  {
    label: '三维资产',
    title: '个人脸谱模型',
    body: '读取个人 OBJ 与 UV 贴图，展示外侧脸谱、内侧素面材质的可旋转模型。',
    href: '/personal_model_viewer.html',
  },
]

function App() {
  const [selectedMode, setSelectedMode] = useState<ExperienceMode>('lite')
  const [portalReady, setPortalReady] = useState(false)
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null)
  const portalRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const audio = ambientAudioRef.current
    if (!audio) return

    const playAmbient = () => {
      audio.volume = 0.32
      audio.loop = true
      void audio.play().catch(() => {
        // Browsers may block sound before the first user gesture.
      })
    }

    const unlockMusic = () => {
      if (audio.paused) playAmbient()
    }

    playAmbient()
    document.addEventListener('pointerdown', unlockMusic)
    document.addEventListener('keydown', unlockMusic)

    return () => {
      document.removeEventListener('pointerdown', unlockMusic)
      document.removeEventListener('keydown', unlockMusic)
    }
  }, [])

  useEffect(() => {
    const target = portalRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPortalReady(true)
        }
      },
      {
        threshold: 0.4,
      },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell')
    if (!shell) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) return

    const handlePointerMove = (event: PointerEvent) => {
      const pointerX = event.clientX / window.innerWidth - 0.5
      const pointerY = event.clientY / window.innerHeight - 0.5
      shell.style.setProperty('--pointer-x', pointerX.toFixed(3))
      shell.style.setProperty('--pointer-y', pointerY.toFixed(3))
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [])

  const scrollToPortal = () => {
    portalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const enterStage = (mode: ExperienceMode) => {
    try {
      sessionStorage.setItem('stage-entry-mode', mode)
      sessionStorage.setItem('stage-entry-time', String(Date.now()))
    } catch {
      // Ignore storage failures and continue with navigation.
    }

    window.location.href = `/stage.html?mode=${mode}&entry=portal`
  }

  return (
    <div className="app-shell">
      <div className="page-backdrop" />
      <audio ref={ambientAudioRef} src={ambientMusicSrc} loop preload="auto" />

      <main className="page-content">
        <nav className="scene-topbar" aria-label="项目愿景">
          <a className="scene-brand" href="#top" aria-label="返回首页顶部">
            AI-OPERA
          </a>
          <div className="scene-slogan">让非遗活在当下，让文化留在未来。</div>
        </nav>

        <section className="hero-stage">
          <div className="hero-copy">
            <span className="eyebrow">AI × 梨园幻境</span>
            <h1 className="hero-title">
              <span>一挥手，</span>
              <span>就能登台变脸。</span>
            </h1>
            <p className="hero-summary">
              这是一个实时互动的川剧变脸体验。允许相机权限后，挥手、快速转头、舞扇都能触发换脸。
            </p>

            <div className="hero-actions">
              <button type="button" className="primary-button" onClick={scrollToPortal}>
                查看舞台入口
              </button>
            </div>

            <div className="hero-status">
              {sceneTelemetry.map((item) => (
                <div className="status-card" key={item.label}>
                  <span className="status-label">{item.label}</span>
                  <strong>{item.value}</strong>
                  <span>{item.body}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-frame">
              <img className="stage-poster" src={heroPosterSrc} alt="AI-Opera 智能川剧变脸主视觉海报" />
              <div className="visual-grid" />
              <div className="visual-glow visual-glow-left" />
              <div className="visual-glow visual-glow-right" />
              <div className="visual-scan" />
              <div className="poster-overlay">
                <div className="poster-topline">
                  <span className="poster-topline-cn">非遗新演 · 川剧变脸</span>
                  <span className="poster-kicker">传统戏艺 × AI 实时交互</span>
                </div>

                <div className="poster-copy">
                  <div className="poster-title">
                    <span className="poster-title-cn">智能川剧变脸</span>
                  </div>
                  <p className="poster-summary">
                    以镜头为台，以动作为引。挥手可变脸，侧首可吐火，扇影掠面时，戏意便在眼前展开。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="feature-grid">
          {showcaseCards.map((card) => (
            <article className="feature-card" key={card.title}>
              <span className="eyebrow">玩法亮点</span>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </article>
          ))}
        </section>

        <section className="module-dossier" aria-label="项目功能模块">
          <div className="module-dossier-copy">
            <span className="eyebrow">功能模块</span>
            <h2 className="module-title">
              <span>从互动体验到专属收藏，</span>
              <span>从即时特效到文化底蕴</span>
              <span>放在同一条叙事线上。</span>
            </h2>
            <p>
              首页不再只是入口，而是整个项目的导览台：先理解 AI 互动，再进入收藏馆听唱段、看原视频，最后查看个人三维脸谱模型。
            </p>
          </div>
          <div className="module-grid">
            {moduleTiles.map((tile, index) => (
              <a
                className="module-tile"
                href={tile.href}
                key={tile.title}
                style={{ '--tile-index': index } as CSSProperties}
              >
                <span>{tile.label}</span>
                <strong>{tile.title}</strong>
                <p>{tile.body}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="journey-strip">
          <div className="journey-copy">
            <span className="eyebrow">开始方式</span>
            <h2>看完此处，即准备入场</h2>
            <p>玩法很直接：先选模式，再滑到底部进入舞台。允许相机权限后，先试挥手和转头，再解锁扇面与吐火。</p>
          </div>

          <div className="journey-list">
            {journeySteps.map((step, index) => (
              <div className="journey-item" key={step}>
                <span className="journey-index">第{index + 1}步</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className={`portal-section ${portalReady ? 'is-ready' : ''}`}
          id="stage-window"
          ref={portalRef}
        >
          <div className="portal-copy">
            <span className="eyebrow">舞台入口</span>
            <h2>准备好了，就从这里开始。</h2>
            <p>
              点击后会进入正式体验页。{modeMeta[selectedMode].stageLine}
              进入页面后，请允许相机权限；先试挥手、转头，再试扇面遮脸和侧头举手的进阶效果。
            </p>

            <div className="mode-panel">
              {(['lite', 'full'] as ExperienceMode[]).map((mode) => {
                const meta = modeMeta[mode]
                const selected = selectedMode === mode

                return (
                  <button
                    key={mode}
                    type="button"
                    className={`mode-card ${selected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedMode(mode)}
                  >
                    <span className="mode-tag">{meta.tag}</span>
                    <strong>{meta.label}</strong>
                    <span>{meta.description}</span>
                    <ul className="mode-details">
                      {meta.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>

            <div className="portal-actions">
              <button type="button" className="primary-button" onClick={() => enterStage(selectedMode)}>
                开始体验
              </button>
              <p className="portal-hint">
                {portalReady ? '入口已经点亮，点击后就能直接开场。' : '继续往下滑，舞台入口就在前面。'}
              </p>
            </div>
          </div>

          <button type="button" className="portal-window" onClick={() => enterStage(selectedMode)}>
            <div className="portal-window-head">
              <span>舞台入口</span>
              <span className={`portal-state ${portalReady ? 'is-live' : ''}`}>
                {portalReady ? '可以入场' : '即将出现'}
              </span>
            </div>

            <div className="portal-preview">
              <img src={heroPosterSrc} alt="舞台预览" />
              <div className="portal-grid" />
              <div className="portal-ring portal-ring-large" />
              <div className="portal-ring portal-ring-small" />
              <div className="portal-sweep" />
              <div className="portal-dots">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="portal-mode-badge">{modeMeta[selectedMode].label}</div>
            </div>

            <div className="portal-window-foot">
              <strong>点击开始体验</strong>
              <span>允许相机权限后，对着镜头做动作，先试挥手，再慢慢解锁舞扇和吐火。</span>
            </div>
          </button>
        </section>
      </main>
    </div>
  )
}

export default App
