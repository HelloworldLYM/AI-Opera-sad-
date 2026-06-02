import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FPS = 30;
export const AI_OPERA_HYPERFRAMES_DURATION = 36 * FPS;

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeInOut = Easing.bezier(0.45, 0, 0.2, 1);

const theme = {
  bg: '#02050a',
  gold: '#e6b95f',
  goldSoft: 'rgba(231, 185, 95, 0.34)',
  cyan: '#20c8ff',
  cyanSoft: 'rgba(32, 200, 255, 0.28)',
  text: '#f8ead0',
};

const posterImages = {
  advantages: 'ai-opera-hyperframes/01_advantages.png',
  applications: 'ai-opera-hyperframes/02_applications.png',
  cultural: 'ai-opera-hyperframes/03_cultural_value.png',
  transitionFace: 'ai-opera-hyperframes/face-mask-transition.png',
};

const introParticles = Array.from({ length: 86 }, (_, i) => ({
  x: (i * 223 + 127) % 1920,
  y: (i * 137 + 91) % 1080,
  cx: 960 + (((i * 47) % 280) - 140),
  cy: 545 + (((i * 83) % 210) - 105),
  s: 1.1 + ((i * 17) % 8) * 0.42,
  o: 0.18 + ((i * 19) % 8) * 0.055,
  hue: i % 3 === 0 ? 'gold' : 'cyan',
}));

const floatParticles = Array.from({ length: 64 }, (_, i) => ({
  x: (i * 181 + 40) % 1920,
  y: 1040 - ((i * 73) % 300),
  s: 1 + ((i * 31) % 5) * 0.55,
  speed: 34 + ((i * 29) % 84),
  phase: ((i * 41) % 120) / 120,
  hue: i % 4 === 0 ? 'gold' : 'cyan',
}));

const dataBits = Array.from({ length: 44 }, (_, i) => ({
  x: 960 + ((i * 37) % 360) - 50,
  y: 275 + ((i * 71) % 400),
  s: 2 + ((i * 11) % 5),
  d: 0.22 + ((i * 13) % 8) * 0.035,
}));

const px = (value) => `${value}px`;

const progress = (frame, start, duration, easing = easeOut) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    ...clamp,
    easing,
  });

const fadeBetween = (frame, start, end, fadeIn = 18, fadeOut = 18) => {
  const enter = progress(frame, start, fadeIn);
  const exit = progress(frame, end - fadeOut, fadeOut);
  return enter * (1 - exit);
};

const valueAt = (time, points, key) => {
  if (time <= points[0].t) return points[0][key];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (time >= a.t && time <= b.t) {
      const easing = b.easing || easeInOut;
      return interpolate(time, [a.t, b.t], [a[key], b[key]], {
        ...clamp,
        easing,
      });
    }
  }
  return points[points.length - 1][key];
};

const getCamera = (sec, points) => ({
  scale: valueAt(sec, points, 'scale'),
  x: valueAt(sec, points, 'x'),
  y: valueAt(sec, points, 'y'),
});

const sceneOneCamera = [
  { t: 2, scale: 1.045, x: 0, y: 0 },
  { t: 4, scale: 1.015, x: 0, y: 0 },
  { t: 8.5, scale: 1.025, x: 0, y: 0 },
  { t: 12, scale: 1.01, x: 0, y: 0 },
  { t: 13, scale: 1.01, x: 0, y: 0 },
];

const sceneTwoCamera = [
  { t: 13, scale: 1.04, x: 0, y: 0 },
  { t: 15, scale: 1.01, x: 0, y: 0 },
  { t: 19, scale: 1.025, x: 0, y: 0 },
  { t: 23, scale: 1.01, x: 0, y: 0 },
  { t: 24, scale: 1.01, x: 0, y: 0 },
];

const sceneThreeCamera = [
  { t: 24, scale: 1.04, x: 0, y: 0 },
  { t: 26, scale: 1.015, x: 0, y: 0 },
  { t: 30, scale: 1.025, x: 0, y: 0 },
  { t: 34, scale: 1.01, x: 0, y: 0 },
  { t: 36, scale: 1.01, x: 0, y: 0 },
];

const boardLayouts = {
  advantages: [
    { x: 35, y: 170, w: 620, h: 742, start: 2.6, duration: 0.85, direction: 'left' },
    { x: 655, y: 170, w: 635, h: 745, start: 4.25, duration: 0.85, direction: 'bottom' },
    { x: 1265, y: 170, w: 610, h: 742, start: 5.9, duration: 0.85, direction: 'right' },
    { x: 205, y: 918, w: 1510, h: 132, start: 7.55, duration: 0.75, direction: 'bottom' },
  ],
  applications: [
    { x: 76, y: 213, w: 620, h: 330, start: 13.55, duration: 0.8, direction: 'left' },
    { x: 1224, y: 213, w: 620, h: 330, start: 14.75, duration: 0.8, direction: 'right' },
    { x: 76, y: 566, w: 620, h: 332, start: 15.95, duration: 0.8, direction: 'left' },
    { x: 1224, y: 566, w: 620, h: 332, start: 17.15, duration: 0.8, direction: 'right' },
    { x: 704, y: 850, w: 520, h: 150, start: 18.55, duration: 0.7, direction: 'bottom' },
  ],
  cultural: [
    { x: 95, y: 195, w: 500, h: 690, start: 24.65, duration: 0.85, direction: 'left' },
    { x: 1170, y: 195, w: 660, h: 690, start: 26.2, duration: 0.9, direction: 'right' },
    { x: 590, y: 210, w: 580, h: 675, start: 28.0, duration: 0.95, direction: 'bottom' },
  ],
};

const fullFrame = {
  width: '100%',
  height: '100%',
};

const PosterScene = ({ src, start, end, points, blocks = [], children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const opacity = fadeBetween(frame, start * fps, end * fps, 18, 22);
  const camera = getCamera(sec, points);

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: theme.bg }}>
      <div
        style={{
          ...fullFrame,
          transform: `translate3d(${px(camera.x)}, ${px(camera.y)}, 0) scale(${camera.scale})`,
          transformOrigin: '50% 50%',
          willChange: 'transform',
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            ...fullFrame,
            objectFit: 'cover',
            display: 'block',
          }}
        />
        <BoardSequence src={src} blocks={blocks} />
      </div>
      {children}
    </AbsoluteFill>
  );
};

const getInset = (direction, p) => {
  const hidden = 100 - p * 100;
  if (direction === 'right') return `inset(0 0 0 ${hidden}% round 7px)`;
  if (direction === 'bottom') return `inset(${hidden}% 0 0 0 round 7px)`;
  if (direction === 'top') return `inset(0 0 ${hidden}% 0 round 7px)`;
  return `inset(0 ${hidden}% 0 0 round 7px)`;
};

const BoardSequence = ({ src, blocks }) => {
  const frame = useCurrentFrame();

  return (
    <>
      {blocks.map((block, index) => (
        <BoardCover key={`cover-${index}`} block={block} frame={frame} />
      ))}
      {blocks.map((block, index) => (
        <BoardReveal key={`reveal-${index}`} block={block} frame={frame} src={src} />
      ))}
    </>
  );
};

const BoardCover = ({ block, frame }) => {
  const start = block.start * FPS;
  const duration = block.duration * FPS;
  const fade = progress(frame, start + duration + 4, 12, easeOut);
  const opacity = 0.98 * (1 - fade);

  if (opacity <= 0.01) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: px(block.x),
        top: px(block.y),
        width: px(block.w),
        height: px(block.h),
        borderRadius: 8,
        background:
          'linear-gradient(135deg, rgba(1, 5, 11, 0.99), rgba(3, 10, 18, 0.98) 48%, rgba(0, 0, 0, 0.995))',
        border: '1px solid rgba(34, 178, 255, 0.12)',
        boxShadow: 'inset 0 0 32px rgba(0, 0, 0, 0.72), 0 0 18px rgba(32, 200, 255, 0.1)',
        opacity,
      }}
    />
  );
};

const BoardReveal = ({ block, frame, src }) => {
  const start = block.start * FPS;
  const duration = block.duration * FPS;
  const p = progress(frame, start, duration, easeInOut);
  const glow = Math.sin(Math.min(1, p) * Math.PI);

  if (frame < start) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: px(block.x),
        top: px(block.y),
        width: px(block.w),
        height: px(block.h),
        overflow: 'hidden',
        borderRadius: 7,
        clipPath: getInset(block.direction, p),
        opacity: p,
        transform: `translate3d(0, ${px(interpolate(p, [0, 1], [18, 0]))}, 0) scale(${interpolate(p, [0, 1], [0.985, 1])})`,
        transformOrigin: '50% 50%',
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          left: px(-block.x),
          top: px(-block.y),
          width: '1920px',
          height: '1080px',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `${px(1.5 + glow)} solid rgba(72, 211, 255, ${0.22 + glow * 0.48})`,
          borderRadius: 7,
          boxShadow: `inset 0 0 ${px(18 + glow * 18)} rgba(32, 200, 255, ${0.1 + glow * 0.2})`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

const Intro = () => {
  const frame = useCurrentFrame();
  const p = progress(frame, 4, 48, easeInOut);
  const titleIn = progress(frame, 18, 28);
  const titleOut = progress(frame, 50, 10);
  const opacity = 1 - progress(frame, 50, 10);

  return (
    <Sequence from={0} durationInFrames={60}>
      <AbsoluteFill style={{ background: theme.bg, opacity }}>
        <AbsoluteFill>
          {introParticles.map((particle, i) => {
            const x = interpolate(p, [0, 1], [particle.x, particle.cx]);
            const y = interpolate(p, [0, 1], [particle.y, particle.cy]);
            const color = particle.hue === 'gold' ? theme.gold : theme.cyan;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: px(x),
                  top: px(y),
                  width: px(particle.s),
                  height: px(particle.s),
                  borderRadius: '50%',
                  background: color,
                  opacity: particle.o * (0.65 + p * 0.75),
                  boxShadow: `0 0 ${px(8 + particle.s * 2)} ${color}`,
                }}
              />
            );
          })}
        </AbsoluteFill>
        <HudRings opacity={0.3} size={430} top={325} />
        <div style={styles.introTitleWrap}>
          <div
            style={{
              ...styles.mainTitle,
              opacity: titleIn * (1 - titleOut),
              transform: `translateY(${px(interpolate(titleIn, [0, 1], [18, 0]))})`,
            }}
          >
            AI-Opera 智能川剧变脸
          </div>
          <div
            style={{
              ...styles.subTitle,
              opacity: titleIn * 0.92 * (1 - titleOut),
            }}
          >
            实时交互 | 三维建模 | 文化闭环
          </div>
        </div>
      </AbsoluteFill>
    </Sequence>
  );
};

const HudRings = ({ opacity = 0.18, size = 520, top = 280, left = 960 }) => {
  const frame = useCurrentFrame();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 520 520"
      style={{
        position: 'absolute',
        left: px(left - size / 2),
        top: px(top),
        opacity,
        overflow: 'visible',
        mixBlendMode: 'screen',
        transform: `rotate(${frame * 0.16}deg)`,
      }}
    >
      <defs>
        <filter id="hudGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="260" cy="260" r="224" fill="none" stroke={theme.cyan} strokeWidth="2" strokeDasharray="28 18" filter="url(#hudGlow)" />
      <circle cx="260" cy="260" r="178" fill="none" stroke={theme.gold} strokeWidth="1.4" strokeDasharray="8 16" />
      <circle cx="260" cy="260" r="112" fill="none" stroke="rgba(80,210,255,0.78)" strokeWidth="1.2" strokeDasharray="2 10" />
      {Array.from({ length: 24 }, (_, i) => (
        <line
          key={i}
          x1="260"
          y1="38"
          x2="260"
          y2="68"
          stroke={i % 3 === 0 ? theme.gold : theme.cyan}
          strokeWidth="1"
          transform={`rotate(${i * 15} 260 260)`}
          opacity="0.72"
        />
      ))}
    </svg>
  );
};

const ScanSweep = ({ start, end, opacity = 0.16 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const visible = sec >= start && sec <= end;
  const cycle = ((sec - start) % 2) / 2;
  const x = interpolate(cycle, [0, 1], [-260, 2100]);

  if (!visible) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity, mixBlendMode: 'screen' }}>
      <div
        style={{
          position: 'absolute',
          left: px(x),
          top: 0,
          width: 190,
          height: '100%',
          background:
            'linear-gradient(90deg, rgba(32,200,255,0), rgba(32,200,255,0.85), rgba(255,214,130,0.18), rgba(32,200,255,0))',
          filter: 'blur(12px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: px(x + 88),
          top: 110,
          bottom: 120,
          width: 2,
          background: 'rgba(110, 224, 255, 0.82)',
          boxShadow: '0 0 22px rgba(50,190,255,0.9)',
        }}
      />
    </AbsoluteFill>
  );
};

const RisingParticles = ({ start = 2, end = 34 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  if (sec < start || sec > end) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
      {floatParticles.map((particle, i) => {
        const local = ((sec * 0.11 + particle.phase) % 1);
        const y = particle.y - local * particle.speed * 3.2;
        const x = particle.x + Math.sin(sec * 0.8 + i) * 12;
        const opacity = 0.1 + Math.sin(local * Math.PI) * 0.28;
        const color = particle.hue === 'gold' ? theme.gold : theme.cyan;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: px(x),
              top: px(y),
              width: px(particle.s),
              height: px(particle.s),
              borderRadius: '50%',
              background: color,
              opacity,
              boxShadow: `0 0 ${px(8 + particle.s * 2)} ${color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const SceneTwoLines = () => {
  const frame = useCurrentFrame();
  const draw = progress(frame, 13 * FPS + 24, 65, easeInOut);
  const dash = 820 * (1 - draw);
  return (
    <Sequence from={13 * FPS} durationInFrames={10 * FPS}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={styles.overlaySvg}>
        <g opacity="0.22" filter="drop-shadow(0 0 8px rgba(32,200,255,0.65))">
          <path d="M960 540 C780 300 575 285 360 320" stroke={theme.cyan} strokeWidth="2" fill="none" strokeDasharray="820" strokeDashoffset={dash} />
          <path d="M960 540 C1135 305 1330 285 1560 320" stroke={theme.cyan} strokeWidth="2" fill="none" strokeDasharray="820" strokeDashoffset={dash} />
          <path d="M960 540 C770 735 560 760 360 720" stroke={theme.cyan} strokeWidth="2" fill="none" strokeDasharray="820" strokeDashoffset={dash} />
          <path d="M960 540 C1140 735 1345 760 1560 720" stroke={theme.cyan} strokeWidth="2" fill="none" strokeDasharray="820" strokeDashoffset={dash} />
        </g>
      </svg>
    </Sequence>
  );
};

const SceneThreeDataFlow = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  if (sec < 24 || sec > 34) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.18, mixBlendMode: 'screen' }}>
      {dataBits.map((bit, i) => {
        const travel = ((sec - 24) * 0.21 + i * 0.037) % 1;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: px(bit.x + travel * 230),
              top: px(bit.y + Math.sin(sec + i) * 8),
              width: px(bit.s * 2.8),
              height: px(bit.s),
              background: i % 3 === 0 ? theme.gold : theme.cyan,
              opacity: bit.d,
              borderRadius: 2,
              filter: 'blur(0.2px)',
              boxShadow: `0 0 ${px(bit.s * 3)} rgba(32,200,255,0.65)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const TransitionOne = () => {
  const frame = useCurrentFrame();
  const p = progress(frame, 12 * FPS, FPS, easeInOut);
  return (
    <Sequence from={12 * FPS} durationInFrames={FPS}>
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div style={{ ...styles.transitionDim, opacity: p * 0.35 }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 50% 48%, rgba(84, 218, 255, 0.28), rgba(19, 91, 142, 0.18) 28%, rgba(0, 0, 0, 0) 62%)',
            opacity: Math.sin(p * Math.PI),
            mixBlendMode: 'screen',
          }}
        />
      </AbsoluteFill>
    </Sequence>
  );
};

const TransitionTwo = () => {
  const frame = useCurrentFrame();
  const close = progress(frame, 23 * FPS, 22, easeInOut);
  const hold = progress(frame, 23 * FPS + 22, 8, easeOut);
  return (
    <Sequence from={23 * FPS} durationInFrames={FPS}>
      <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ ...styles.goldCurtain, left: px(interpolate(close, [0, 1], [-1120, 0])) }} />
        <div style={{ ...styles.goldCurtain, right: px(interpolate(close, [0, 1], [-1120, 0])), transform: 'scaleX(-1)' }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.2)',
            opacity: hold * 0.65,
          }}
        />
      </AbsoluteFill>
    </Sequence>
  );
};

const FaceSplitTransition = ({ from }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  const slide = progress(frame, from, 21, easeInOut);
  const settle = progress(frame, from + 16, 10, easeOut);
  const fade = progress(frame, from + 23, 7, easeInOut);
  const opacity = local < 0 || local > FPS ? 0 : 1 - fade;
  const imageWidth = 1280;
  const imageHeight = Math.round((imageWidth * 941) / 1672);
  const leftOffset = interpolate(slide, [0, 1], [-760, 0]);
  const rightOffset = interpolate(slide, [0, 1], [760, 0]);
  const scale = interpolate(settle, [0, 1], [1.02, 1]);

  if (opacity <= 0.01) return null;

  const halfBase = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: px(imageWidth),
    height: px(imageHeight),
    transformOrigin: '50% 50%',
    filter: 'drop-shadow(0 0 30px rgba(231,185,95,0.34)) drop-shadow(0 0 26px rgba(32,200,255,0.16))',
  };

  return (
    <Sequence from={from} durationInFrames={FPS}>
      <AbsoluteFill style={{ pointerEvents: 'none', opacity, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 50% 48%, rgba(231,185,95,0.22), rgba(0,0,0,0.82) 48%, rgba(0,0,0,0.95) 100%)',
          }}
        />
        <div
          style={{
            ...halfBase,
            clipPath: 'inset(0 50% 0 0)',
            transform: `translate(-50%, -50%) translateX(${px(leftOffset)}) scale(${scale})`,
          }}
        >
          <Img src={staticFile(posterImages.transitionFace)} style={styles.faceTransitionImage} />
        </div>
        <div
          style={{
            ...halfBase,
            clipPath: 'inset(0 0 0 50%)',
            transform: `translate(-50%, -50%) translateX(${px(rightOffset)}) scale(${scale})`,
          }}
        >
          <Img src={staticFile(posterImages.transitionFace)} style={styles.faceTransitionImage} />
        </div>
        <HudRings opacity={0.16 * (1 - fade)} size={620} top={230} />
      </AbsoluteFill>
    </Sequence>
  );
};

const GlobalTexture = () => (
  <AbsoluteFill pointerEvents="none">
    <div style={styles.scanlines} />
    <div style={styles.noise} />
    <div style={styles.vignette} />
    <div style={styles.goldFrame} />
  </AbsoluteFill>
);

const Outro = () => {
  const frame = useCurrentFrame();
  const show = progress(frame, 34 * FPS, 24, easeOut);
  const black = progress(frame, 35.5 * FPS, 15, easeInOut);
  return (
    <Sequence from={34 * FPS} durationInFrames={2 * FPS}>
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div
          style={{
            ...styles.outroDim,
            opacity: interpolate(show, [0, 1], [0, 0.58]),
            backdropFilter: `blur(${px(interpolate(show, [0, 1], [0, 3]))})`,
          }}
        />
        <div style={{ ...styles.outroTitleWrap, opacity: show * (1 - black * 0.3) }}>
          <div style={styles.outroTitle}>AI-Opera 智能川剧变脸</div>
          <div style={styles.outroSubTitle}>让非遗活在当下，让文化留在未来</div>
        </div>
        <div style={{ ...styles.blackFade, opacity: black }} />
      </AbsoluteFill>
    </Sequence>
  );
};

export const AIOperaHyperframes = () => {
  return (
    <AbsoluteFill style={styles.root}>
      <Intro />
      <PosterScene
        src={posterImages.advantages}
        start={2}
        end={13}
        points={sceneOneCamera}
        blocks={boardLayouts.advantages}
      >
        <HudRings opacity={0.14} size={560} top={250} />
      </PosterScene>
      <PosterScene
        src={posterImages.applications}
        start={13}
        end={24}
        points={sceneTwoCamera}
        blocks={boardLayouts.applications}
      >
        <SceneTwoLines />
        <HudRings opacity={0.16} size={500} top={250} />
      </PosterScene>
      <PosterScene
        src={posterImages.cultural}
        start={24}
        end={36}
        points={sceneThreeCamera}
        blocks={boardLayouts.cultural}
      >
        <SceneThreeDataFlow />
        <HudRings opacity={0.15} size={590} top={250} />
      </PosterScene>
      <FaceSplitTransition from={12 * FPS} />
      <FaceSplitTransition from={23 * FPS} />
      <RisingParticles />
      <GlobalTexture />
      <Outro />
    </AbsoluteFill>
  );
};

const fontFamily =
  '"Microsoft YaHei", SimHei, "Noto Sans CJK SC", "PingFang SC", sans-serif';

const styles = {
  root: {
    backgroundColor: theme.bg,
    fontFamily,
    color: theme.text,
    overflow: 'hidden',
  },
  introTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 392,
    textAlign: 'center',
    textShadow: '0 0 24px rgba(230,185,95,0.45)',
  },
  mainTitle: {
    fontSize: 82,
    fontWeight: 700,
    letterSpacing: 0,
    color: theme.gold,
    lineHeight: 1.16,
  },
  subTitle: {
    marginTop: 26,
    fontSize: 31,
    color: 'rgba(248, 234, 208, 0.9)',
    letterSpacing: 0,
  },
  overlaySvg: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    mixBlendMode: 'screen',
  },
  faceTransitionImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  },
  transitionDim: {
    position: 'absolute',
    inset: 0,
    background: '#000',
  },
  goldCurtain: {
    position: 'absolute',
    top: 0,
    width: 1120,
    height: '100%',
    background:
      'radial-gradient(circle at 74% 50%, rgba(231,185,95,0.48), rgba(140,96,35,0.32) 36%, rgba(4,6,10,0.96) 76%), linear-gradient(90deg, rgba(0,0,0,0.98), rgba(35,25,10,0.9), rgba(231,185,95,0.24))',
    filter: 'blur(0.4px)',
    opacity: 0.95,
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    opacity: 0.12,
    mixBlendMode: 'soft-light',
    background:
      'repeating-linear-gradient(180deg, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 1px, rgba(0,0,0,0) 3px, rgba(0,0,0,0) 7px)',
  },
  noise: {
    position: 'absolute',
    inset: 0,
    opacity: 0.08,
    mixBlendMode: 'overlay',
    backgroundImage:
      'radial-gradient(circle at 12% 18%, rgba(255,255,255,0.2) 0 1px, transparent 1.2px), radial-gradient(circle at 72% 63%, rgba(255,255,255,0.16) 0 1px, transparent 1.2px), radial-gradient(circle at 35% 78%, rgba(255,255,255,0.12) 0 1px, transparent 1.1px)',
    backgroundSize: '21px 19px, 29px 31px, 37px 41px',
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 50% 48%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.25) 79%, rgba(0,0,0,0.5) 100%)',
    opacity: 1,
  },
  goldFrame: {
    position: 'absolute',
    inset: 18,
    border: '1px solid rgba(231,185,95,0.16)',
    boxShadow: 'inset 0 0 36px rgba(231,185,95,0.11), 0 0 20px rgba(32,200,255,0.08)',
    opacity: 0.8,
  },
  outroDim: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.62)',
  },
  outroTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 396,
    textAlign: 'center',
    textShadow: '0 0 26px rgba(231,185,95,0.58), 0 0 52px rgba(32,200,255,0.18)',
  },
  outroTitle: {
    fontSize: 78,
    fontWeight: 800,
    color: theme.gold,
    lineHeight: 1.18,
  },
  outroSubTitle: {
    marginTop: 24,
    fontSize: 34,
    color: 'rgba(248, 234, 208, 0.94)',
  },
  blackFade: {
    position: 'absolute',
    inset: 0,
    background: '#000',
  },
};
