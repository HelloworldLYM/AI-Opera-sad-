import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FPS = 30;
const SCENE = 150;
const CHALLENGE_SCENE = 180;
const POSITIONING_SCENE = 210;
export const AI_OPERA_PROMO_DURATION = SCENE + CHALLENGE_SCENE + POSITIONING_SCENE + SCENE * 4;
const DURATION = AI_OPERA_PROMO_DURATION;

const theme = {
  bg: '#04070d',
  panel: 'rgba(8, 14, 24, 0.82)',
  panelSoft: 'rgba(10, 20, 32, 0.62)',
  red: '#d92d20',
  gold: '#d7a84a',
  goldLight: '#ffe6ad',
  cyan: '#20d7e8',
  text: '#f2e8d5',
  muted: 'rgba(242,232,213,0.72)',
  dark: '#070a10',
};

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeInOut = Easing.bezier(0.45, 0, 0.55, 1);

const progress = (frame, start, duration) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

const particles = Array.from({ length: 72 }, (_, i) => ({
  x: (i * 131) % 1920,
  y: (i * 79) % 1080,
  s: 1 + ((i * 17) % 7) * 0.45,
  d: 0.36 + ((i * 13) % 8) * 0.04,
}));

const facePoints = [
  [50, 8], [38, 12], [62, 12], [28, 24], [72, 24], [22, 42], [78, 42],
  [28, 66], [72, 66], [40, 84], [60, 84], [50, 92], [50, 34],
  [42, 38], [58, 38], [50, 50], [42, 58], [58, 58], [40, 70], [60, 70],
  [34, 32], [44, 30], [56, 30], [66, 32], [35, 52], [65, 52],
];

const faceLines = [
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8],
  [7, 9], [8, 10], [9, 11], [10, 11], [12, 15], [15, 16], [15, 17],
  [16, 18], [17, 19], [20, 21], [22, 23], [24, 25], [13, 14],
];

const handPoints = [
  [12, 78], [20, 68], [28, 58], [36, 49], [45, 41], [29, 68], [41, 60],
  [52, 54], [63, 48], [31, 77], [45, 72], [59, 66], [73, 60], [29, 86],
  [43, 86], [58, 83], [73, 78], [24, 93], [38, 96], [53, 96], [68, 94],
];

const handBones = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15],
  [15, 16], [0, 17], [17, 18], [18, 19], [19, 20],
];

const Caption = ({ title, sub, align = 'left' }) => {
  const frame = useCurrentFrame();
  const enter = progress(frame, 12, 28);
  const exit = progress(frame, 126, 18);
  const opacity = enter * (1 - exit);
  const y = interpolate(enter, [0, 1], [34, 0]);
  const left = align === 'center' ? 0 : 104;
  const width = align === 'center' ? '100%' : 1180;
  const titleSize = align === 'center' ? 66 : title.length > 15 ? 54 : 62;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: align === 'center' ? 740 : 96,
        width,
        zIndex: 60,
        opacity,
        textAlign: align,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          color: theme.text,
          fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
          fontSize: titleSize,
          fontWeight: 900,
          lineHeight: 1.12,
          letterSpacing: 0,
          textShadow: `0 0 26px rgba(215,168,74,0.22), 0 5px 18px rgba(0,0,0,0.72)`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 16,
          color: theme.goldLight,
          fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
          fontSize: align === 'center' ? 28 : 27,
          fontWeight: 650,
          lineHeight: 1.4,
          letterSpacing: 0,
          textShadow: `0 0 18px rgba(32,215,232,0.24), 0 3px 10px rgba(0,0,0,0.7)`,
        }}
      >
        {sub}
      </div>
    </div>
  );
};

const StageBackground = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const drift = frame * 0.28;
  const pulse = interpolate(Math.sin(frame / 24), [-1, 1], [0.18, 0.34]);
  const stageGlow = interpolate(Math.sin(frame / 54), [-1, 1], [0.2, 0.42]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        overflow: 'hidden',
        background: `
          radial-gradient(circle at 50% -10%, rgba(32,215,232,0.20), transparent 30%),
          radial-gradient(circle at 16% 48%, rgba(217,45,32,0.18), transparent 34%),
          radial-gradient(circle at 82% 56%, rgba(215,168,74,0.15), transparent 36%),
          linear-gradient(180deg, #03050a 0%, #060a12 48%, #020408 100%)
        `,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(circle at 18% 22%, rgba(217,45,32,${0.2 * intensity}), transparent 24%),
            radial-gradient(circle at 73% 22%, rgba(32,215,232,${0.18 * intensity}), transparent 24%),
            radial-gradient(circle at 58% 84%, rgba(215,168,74,${0.14 * intensity}), transparent 28%),
            linear-gradient(180deg, rgba(4,7,13,0.30), rgba(4,7,13,0.96))
          `,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 250 + Math.sin(frame / 68) * 42,
          top: -140,
          width: 420,
          height: 1240,
          clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)',
          background: `linear-gradient(180deg, rgba(255,230,173,${stageGlow * intensity}), rgba(215,168,74,0.05) 66%, transparent)`,
          filter: 'blur(10px)',
          opacity: 0.42 * intensity,
          transform: 'rotate(-15deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 220 + Math.cos(frame / 74) * 38,
          top: -180,
          width: 420,
          height: 1240,
          clipPath: 'polygon(43% 0, 57% 0, 100% 100%, 0 100%)',
          background: `linear-gradient(180deg, rgba(32,215,232,${0.28 * intensity}), rgba(32,215,232,0.03) 68%, transparent)`,
          filter: 'blur(12px)',
          opacity: 0.32 * intensity,
          transform: 'rotate(14deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: pulse * intensity,
          backgroundImage: `
            linear-gradient(rgba(32,215,232,0.24) 1px, transparent 1px),
            linear-gradient(90deg, rgba(32,215,232,0.22) 1px, transparent 1px)
          `,
          backgroundSize: '76px 76px',
          backgroundPosition: `${-drift}px ${drift * 0.45}px`,
          maskImage: 'radial-gradient(circle at center, black 0%, black 68%, transparent 96%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.12,
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(242,232,213,0.18) 0, rgba(242,232,213,0.18) 1px, transparent 1px, transparent 5px)',
        }}
      />
      <ParticleField />
    </AbsoluteFill>
  );
};

const ParticleField = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {particles.map((p, i) => {
        const x = p.x + Math.sin((frame + i * 13) / 42) * 24;
        const y = (p.y + frame * p.d) % 1080;
        const opacity = 0.22 + (Math.sin((frame + i * 11) / 18) + 1) * 0.12;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: p.s,
              height: p.s,
              borderRadius: 999,
              background: i % 3 === 0 ? theme.goldLight : theme.cyan,
              opacity,
              boxShadow: `0 0 ${8 + p.s * 4}px ${i % 3 === 0 ? theme.gold : theme.cyan}`,
            }}
          />
        );
      })}
    </div>
  );
};

const ScanTransition = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const sweep = progress(frame, delay, 32);
  const x = interpolate(sweep, [0, 1], [-460, 2140]);
  const opacity = interpolate(sweep, [0, 0.2, 0.82, 1], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: -160,
        zIndex: 80,
        width: 260,
        height: 1400,
        opacity,
        transform: 'rotate(12deg)',
        background: `linear-gradient(90deg, transparent, rgba(32,215,232,0.18), ${theme.goldLight}, rgba(32,215,232,0.2), transparent)`,
        filter: 'blur(1px)',
        mixBlendMode: 'screen',
      }}
    />
  );
};

const MaskModel = ({ src = 'guanyu.png', size = 430, frameOffset = 0 }) => {
  const frame = useCurrentFrame();
  const rot = Math.sin((frame + frameOffset) / 38) * 22;
  const float = Math.sin((frame + frameOffset) / 24) * 12;
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size * 1.2,
        perspective: 900,
        transform: `translateY(${float}px)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 8,
          width: size * 0.72,
          height: 42,
          transform: 'translateX(-50%)',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(32,215,232,0.22), rgba(0,0,0,0.42) 58%, transparent 78%)',
          filter: 'blur(10px)',
        }}
      />
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: size,
          height: size * 1.08,
          objectFit: 'contain',
          transform: `translateX(-50%) rotateY(${rot}deg) rotateX(-4deg)`,
          transformStyle: 'preserve-3d',
          filter:
            'drop-shadow(0 32px 38px rgba(0,0,0,0.68)) drop-shadow(0 0 28px rgba(215,168,74,0.22))',
        }}
      />
    </div>
  );
};

const FaceMesh = ({ width = 430, height = 530, color = theme.cyan, opacity = 0.72 }) => {
  const frame = useCurrentFrame();
  const rot = Math.sin(frame / 34) * 8;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      style={{
        position: 'relative',
        overflow: 'visible',
        transform: `rotateY(${rot}deg)`,
        filter: `drop-shadow(0 0 18px ${color})`,
        opacity,
      }}
    >
      {faceLines.map(([a, b], i) => (
        <line
          key={i}
          x1={facePoints[a][0]}
          y1={facePoints[a][1]}
          x2={facePoints[b][0]}
          y2={facePoints[b][1]}
          stroke={color}
          strokeWidth="0.38"
          opacity="0.72"
        />
      ))}
      {facePoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 5 === 0 ? 1.05 : 0.72} fill={i % 4 === 0 ? theme.goldLight : color} />
      ))}
    </svg>
  );
};

const HandSkeleton = () => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [20, 120], [-80, 80], {
    ...clamp,
    easing: easeInOut,
  });
  return (
    <svg
      width="360"
      height="300"
      viewBox="0 0 100 100"
      style={{
        position: 'absolute',
        right: 148 + sweep,
        top: 500,
        zIndex: 35,
        opacity: 0.85,
        filter: `drop-shadow(0 0 18px ${theme.cyan})`,
      }}
    >
      {handBones.map(([a, b], i) => (
        <line
          key={i}
          x1={handPoints[a][0]}
          y1={handPoints[a][1]}
          x2={handPoints[b][0]}
          y2={handPoints[b][1]}
          stroke={theme.cyan}
          strokeWidth="0.8"
          opacity="0.76"
        />
      ))}
      {handPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 0 ? 1.6 : 1.1} fill={i % 4 === 0 ? theme.goldLight : theme.cyan} />
      ))}
    </svg>
  );
};

const HUDFrame = ({ children, style }) => (
  <div
    style={{
      position: 'absolute',
      border: `1px solid rgba(32,215,232,0.24)`,
      background: 'linear-gradient(180deg, rgba(6,10,18,0.86), rgba(7,13,22,0.66))',
      boxShadow: '0 28px 90px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)',
      borderRadius: 18,
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

const ProductMock = ({ x = 970, y = 150, scale = 1 }) => {
  const frame = useCurrentFrame();
  const inP = progress(frame, 30, 32);
  const tags = ['佩戴', '触发', '了解', '绘制', '生成三维模型'];
  return (
    <HUDFrame
      style={{
        left: x,
        top: y,
        width: 760 * scale,
        height: 520 * scale,
        opacity: inP,
        transform: `scale(${scale}) translateY(${interpolate(inP, [0, 1], [36, 0])}px)`,
        transformOrigin: 'top left',
      }}
    >
      <Img
        src={staticFile('main_poster_panel_v2.png')}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.54 }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(4,7,13,0.86), rgba(4,7,13,0.32))' }} />
      <div style={{ position: 'absolute', left: 44, top: 42, color: theme.goldLight, fontSize: 24, fontWeight: 800 }}>
        AI-Opera 智能川剧变脸
      </div>
      <div style={{ position: 'absolute', left: 44, top: 96, color: theme.text, fontSize: 50, fontWeight: 900, lineHeight: 1.18 }}>
        一挥手，<br />就能登台变脸
      </div>
      <div style={{ position: 'absolute', left: 44, bottom: 44, display: 'flex', gap: 12, flexWrap: 'wrap', width: 620 }}>
        {tags.map((tag, i) => {
          const p = progress(frame, 48 + i * 9, 18);
          return (
            <div
              key={tag}
              style={{
                padding: '12px 17px',
                borderRadius: 999,
                border: `1px solid rgba(255,230,173,${0.2 + p * 0.4})`,
                background: i === 4 ? `linear-gradient(135deg, ${theme.goldLight}, ${theme.gold})` : 'rgba(255,255,255,0.06)',
                color: i === 4 ? '#311a04' : theme.text,
                fontWeight: 850,
                fontSize: 21,
                opacity: p,
                transform: `translateY(${interpolate(p, [0, 1], [18, 0])}px)`,
              }}
            >
              {tag}
            </div>
          );
        })}
      </div>
    </HUDFrame>
  );
};

const SceneShell = ({ children, caption, sub, align = 'left', intensity = 1 }) => (
  <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: 'hidden' }}>
    <StageBackground intensity={intensity} />
    {children}
    <Caption title={caption} sub={sub} align={align} />
    <ScanTransition delay={122} />
  </AbsoluteFill>
);

const BackgroundScene = () => {
  const frame = useCurrentFrame();
  const maskIn = progress(frame, 18, 36);
  const dissolve = progress(frame, 86, 42);
  return (
    <SceneShell
      caption="川剧变脸，不只是视觉奇观"
      sub="人物性格、戏曲程式与地域文化记忆"
      intensity={1.12}
    >
      <Img
        src={staticFile('ppt-image3.jpeg')}
        style={{
          position: 'absolute',
          right: -80,
          bottom: -120,
          width: 980,
          opacity: 0.28,
          filter: 'saturate(0.9) contrast(1.1)',
          transform: `translateX(${interpolate(frame, [0, 150], [40, -50])}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 690,
          top: 130,
          width: 610,
          height: 780,
          display: 'grid',
          placeItems: 'center',
          opacity: maskIn,
          transform: `scale(${interpolate(maskIn, [0, 1], [0.82, 1])})`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            width: 360,
            height: 720,
            clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)',
            background: 'linear-gradient(180deg, rgba(255,230,173,0.36), rgba(215,168,74,0.08) 70%, transparent)',
            filter: 'blur(5px)',
          }}
        />
        <div style={{ opacity: 1 - dissolve }}>
          <MaskModel src="guanyu.png" size={470} />
        </div>
        <div
          style={{
            position: 'absolute',
            opacity: dissolve,
            transform: `scale(${interpolate(dissolve, [0, 1], [0.8, 1.08])})`,
          }}
        >
          <FaceMesh width={500} height={620} />
        </div>
      </div>
      {particles.slice(0, 36).map((p, i) => {
        const burst = progress(frame, 88 + (i % 8) * 2, 28);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 960 + Math.cos(i * 0.8) * burst * 420,
              top: 480 + Math.sin(i * 1.1) * burst * 360,
              width: 4 + (i % 4),
              height: 4 + (i % 4),
              borderRadius: 999,
              background: i % 2 ? theme.goldLight : theme.cyan,
              opacity: dissolve * (1 - burst * 0.25),
              boxShadow: `0 0 18px ${i % 2 ? theme.goldLight : theme.cyan}`,
            }}
          />
        );
      })}
    </SceneShell>
  );
};

const CoverScene = () => {
  const frame = useCurrentFrame();
  const coverScale = interpolate(frame, [0, SCENE], [1.045, 1.095], clamp);
  const titleIn = progress(frame, 16, 30);
  const scanP = progress(frame, 24, 58);
  const ring = progress(frame, 12, 56);
  const sweepX = interpolate(scanP, [0, 1], [-520, 2200]);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: 'hidden' }}>
      <StageBackground intensity={0.92} />
      <Img
        src={staticFile('cover-reference-wide.png')}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.86,
          filter: 'saturate(1.08) contrast(1.08) brightness(0.72)',
          transform: `scale(${coverScale}) translate(${Math.sin(frame / 80) * -8}px, ${Math.cos(frame / 74) * 4}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            linear-gradient(90deg, rgba(2,4,8,0.12), rgba(2,4,8,0.18) 42%, rgba(2,4,8,0.78) 100%),
            linear-gradient(180deg, rgba(2,4,8,0.42), rgba(2,4,8,0.04) 36%, rgba(2,4,8,0.98) 74%, #020408 100%)
          `,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 360,
          background: 'linear-gradient(180deg, transparent 0%, rgba(2,4,8,0.92) 30%, #020408 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: sweepX,
          top: -170,
          width: 260,
          height: 1360,
          transform: 'rotate(13deg)',
          background: `linear-gradient(90deg, transparent, rgba(32,215,232,0.16), ${theme.goldLight}, rgba(32,215,232,0.22), transparent)`,
          filter: 'blur(1px)',
          opacity: interpolate(scanP, [0, 0.16, 0.82, 1], [0, 0.95, 0.95, 0], clamp),
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1065,
          top: 168,
          width: 360,
          height: 360,
          borderRadius: 999,
          border: `1px solid rgba(32,215,232,${0.2 + ring * 0.28})`,
          boxShadow: `0 0 ${interpolate(ring, [0, 1], [18, 80])}px rgba(32,215,232,0.22)`,
          opacity: 0.62,
          transform: `scale(${interpolate(ring, [0, 1], [0.74, 1.12])}) rotate(${frame * 0.42}deg)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1098,
          top: 202,
          width: 292,
          height: 292,
          borderRadius: 999,
          border: `1px dashed rgba(255,230,173,${0.22 + ring * 0.24})`,
          opacity: 0.56,
          transform: `rotate(${-frame * 0.64}deg)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 98,
          bottom: 92,
          width: 960,
          opacity: titleIn,
          transform: `translateY(${interpolate(titleIn, [0, 1], [32, 0])}px)`,
        }}
      >
        <div
          style={{
            color: theme.goldLight,
            fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 0,
            textShadow: '0 0 20px rgba(215,168,74,0.38)',
          }}
        >
          非物质文化遗产 × Web 智能交互
        </div>
        <div
          style={{
            marginTop: 12,
            color: theme.text,
            fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
            fontSize: 76,
            fontWeight: 950,
            lineHeight: 1.02,
            letterSpacing: 0,
            textShadow: '0 0 30px rgba(32,215,232,0.26), 0 10px 34px rgba(0,0,0,0.78)',
          }}
        >
          AI-Opera 智能川剧变脸
        </div>
        <div
          style={{
            marginTop: 22,
            display: 'flex',
            gap: 14,
            color: theme.cyan,
            fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
            fontSize: 23,
            fontWeight: 850,
          }}
        >
          {['实时佩戴', '手势触发', '脸谱陈列', '三维生成'].map((item, index) => (
            <div
              key={item}
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                border: '1px solid rgba(32,215,232,0.32)',
                background: index === 3 ? `linear-gradient(135deg, ${theme.goldLight}, ${theme.gold})` : 'rgba(4,10,18,0.64)',
                color: index === 3 ? '#281704' : theme.text,
                boxShadow: index === 3 ? '0 0 26px rgba(215,168,74,0.22)' : '0 0 18px rgba(32,215,232,0.08)',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 106,
          bottom: 114,
          width: 420,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${theme.cyan}, ${theme.goldLight})`,
          opacity: titleIn,
          boxShadow: `0 0 24px ${theme.cyan}`,
        }}
      />
      <ScanTransition delay={122} />
    </AbsoluteFill>
  );
};

const SceneTitleBlock = ({ title, sub, left = 104, top = 84, width = 1120 }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, 10, 24);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        zIndex: 60,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [26, 0])}px)`,
      }}
    >
      <div
        style={{
          color: theme.text,
          fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
          fontSize: 58,
          fontWeight: 950,
          lineHeight: 1.08,
          letterSpacing: 0,
          textShadow: '0 0 28px rgba(32,215,232,0.22), 0 10px 30px rgba(0,0,0,0.72)',
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 14,
          color: theme.goldLight,
          fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
          fontSize: 27,
          fontWeight: 850,
          letterSpacing: 0,
          textShadow: '0 0 18px rgba(215,168,74,0.26)',
        }}
      >
        {sub}
      </div>
    </div>
  );
};

const GoldCloudLines = ({ left = 110, top = 520, opacity = 0.45 }) => (
  <svg
    width="460"
    height="180"
    viewBox="0 0 460 180"
    style={{
      position: 'absolute',
      left,
      top,
      opacity,
      filter: 'drop-shadow(0 0 16px rgba(215,168,74,0.26))',
    }}
  >
    <path d="M18 126 C74 70 130 78 150 122 C164 154 112 158 105 128 C98 98 150 68 204 92 C238 108 238 148 208 152 C178 156 174 118 205 112 C268 98 292 42 350 58 C402 72 430 116 438 152" fill="none" stroke={theme.goldLight} strokeWidth="4" opacity="0.82" />
    <path d="M36 150 H438" stroke={theme.gold} strokeWidth="2" opacity="0.45" />
  </svg>
);

const DiagnosticPanel = ({ index, title, body, left, delay, merge }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, delay, 22);
  const warn = interpolate(Math.sin((frame + index * 17) / 6), [-1, 1], [0.28, 1]);
  const targetLeft = 730;
  const targetTop = 544;
  const top = 628;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: 460,
        height: 218,
        zIndex: 52,
        opacity: p * (1 - merge * 0.22),
        transform: `translate(${(targetLeft - left) * merge}px, ${(targetTop - top) * merge}px) scale(${1 - merge * 0.54})`,
        transformOrigin: 'center',
        clipPath: 'polygon(0 0, 94% 0, 100% 14%, 100% 100%, 6% 100%, 0 86%)',
        border: '1px solid rgba(32,215,232,0.46)',
        background: `
          linear-gradient(135deg, rgba(11,21,34,0.86), rgba(8,12,20,0.58)),
          repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 5px)
        `,
        boxShadow: `0 24px 70px rgba(0,0,0,0.42), inset 0 0 34px rgba(32,215,232,${0.06 + warn * 0.05})`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.22,
          backgroundImage: 'linear-gradient(90deg, rgba(32,215,232,0.32) 1px, transparent 1px), linear-gradient(rgba(32,215,232,0.28) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 22,
          top: 18,
          width: 13,
          height: 13,
          borderRadius: 999,
          background: theme.red,
          opacity: warn,
          boxShadow: `0 0 ${12 + warn * 20}px rgba(217,45,32,0.84)`,
        }}
      />
      <div style={{ position: 'absolute', right: 22, top: 16, color: theme.cyan, fontSize: 18, fontWeight: 900, opacity: 0.72 }}>
        ISSUE 0{index}
      </div>
      <div style={{ position: 'absolute', left: 48, right: 28, top: 48 }}>
        <div style={{ color: theme.goldLight, fontSize: 30, fontWeight: 950, lineHeight: 1.18 }}>{title}</div>
        <div style={{ marginTop: 16, color: theme.text, fontSize: 22, fontWeight: 700, lineHeight: 1.45, opacity: 0.82 }}>{body}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: `${interpolate(p, [0, 1], [0, 100])}%`,
          height: 3,
          background: `linear-gradient(90deg, ${theme.red}, ${theme.goldLight}, ${theme.cyan})`,
          boxShadow: `0 0 18px ${theme.cyan}`,
        }}
      />
    </div>
  );
};

const Scene_BackgroundChallenge = () => {
  const frame = useCurrentFrame();
  const scan = progress(frame, 22, 42);
  const split = progress(frame, 58, 28);
  const merge = progress(frame, 144, 28);
  const x = interpolate(scan, [0, 1], [-220, 2140]);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: 'hidden' }}>
      <StageBackground intensity={1.04} />
      <SceneTitleBlock title="传统脸谱传播，面临新的挑战" sub="理解难｜参与难｜留存难" />
      <Img
        src={staticFile('cover-reference-wide.png')}
        style={{
          position: 'absolute',
          left: -240,
          top: 168,
          width: 850,
          height: 510,
          objectFit: 'cover',
          opacity: 0.38 * (1 - split * 0.32),
          filter: 'saturate(1.08) contrast(1.08) brightness(0.72)',
          transform: `scale(${1.02 + frame * 0.00045})`,
          borderRadius: 26,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -240,
          top: 514,
          width: 850,
          height: 170,
          borderRadius: '0 0 26px 26px',
          background: 'linear-gradient(180deg, rgba(4,7,13,0.74), rgba(4,7,13,0.98))',
          opacity: 0.9,
        }}
      />
      <GoldCloudLines />
      <div style={{ position: 'absolute', left: 494, top: 176, opacity: 0.9 * (1 - merge) }}>
        <MaskModel src="guanyu.png" size={370} frameOffset={30} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 642,
          top: 302,
          opacity: split * (1 - merge),
          transform: `scale(${interpolate(split, [0, 1], [0.72, 1])})`,
        }}
      >
        <FaceMesh width={330} height={420} opacity={0.82} />
      </div>
      {['ppt-image15.png', 'ppt-image13.png', 'ppt-image14.png'].map((img, i) => {
        const p = progress(frame, 50 + i * 8, 24);
        return (
          <Img
            key={img}
            src={staticFile(img)}
            style={{
              position: 'absolute',
              right: 90 + i * 104,
              top: 170 + i * 58,
              width: 440,
              height: 255,
              objectFit: 'cover',
              borderRadius: 18,
              opacity: p * 0.42 * (1 - merge * 0.55),
              filter: 'blur(1.4px) saturate(0.85) brightness(0.68)',
              transform: `rotate(${[-8, 4, -3][i]}deg) translateX(${interpolate(p, [0, 1], [60, 0])}px)`,
              boxShadow: '0 28px 80px rgba(0,0,0,0.48)',
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: -120,
          width: 180,
          height: 1320,
          transform: 'rotate(8deg)',
          opacity: interpolate(scan, [0, 0.14, 0.86, 1], [0, 1, 1, 0], clamp),
          background: `linear-gradient(90deg, transparent, rgba(32,215,232,0.28), ${theme.goldLight}, rgba(32,215,232,0.28), transparent)`,
          filter: 'blur(1px)',
          mixBlendMode: 'screen',
          zIndex: 48,
        }}
      />
      <DiagnosticPanel index={1} title="国潮有兴趣" body="文化理解不足" left={135} delay={54} merge={merge} />
      <DiagnosticPanel index={2} title="想参与" body="却被门槛挡住" left={730} delay={68} merge={merge} />
      <DiagnosticPanel index={3} title="滤镜热闹" body="记忆难留存" left={1325} delay={82} merge={merge} />
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity: merge, zIndex: 50 }}>
        <line x1="365" y1="738" x2="960" y2="650" stroke={theme.red} strokeWidth="3" opacity="0.68" />
        <line x1="960" y1="738" x2="960" y2="650" stroke={theme.red} strokeWidth="3" opacity="0.68" />
        <line x1="1555" y1="738" x2="960" y2="650" stroke={theme.red} strokeWidth="3" opacity="0.68" />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 900,
          top: 592,
          width: 120,
          height: 120,
          borderRadius: 999,
          opacity: merge,
          background: 'radial-gradient(circle, #ff4a38 0%, rgba(217,45,32,0.42) 34%, transparent 68%)',
          boxShadow: '0 0 80px rgba(217,45,32,0.72), 0 0 130px rgba(32,215,232,0.2)',
          transform: `scale(${interpolate(merge, [0, 1], [0.4, 1])})`,
          display: 'grid',
          placeItems: 'center',
          color: theme.text,
          fontSize: 21,
          fontWeight: 950,
          zIndex: 55,
        }}
      >
        待解决
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: progress(frame, 164, 16),
          background: `radial-gradient(circle at center, rgba(255,230,173,0.44), rgba(32,215,232,0.2) 18%, transparent 42%)`,
          mixBlendMode: 'screen',
          zIndex: 70,
        }}
      />
    </AbsoluteFill>
  );
};

const MiniFeatureVisual = ({ type, p }) => {
  if (type === 'wear') {
    return (
      <div style={{ position: 'relative', width: 82, height: 82 }}>
        <FaceMesh width={82} height={82} opacity={0.45 + p * 0.35} />
        <Img src={staticFile('guanyu.png')} style={{ position: 'absolute', left: 18 - p * 10, top: 10, width: 55, height: 65, objectFit: 'contain', opacity: 0.58 + p * 0.32 }} />
      </div>
    );
  }
  if (type === 'gesture') {
    return (
      <svg width="88" height="82" viewBox="0 0 88 82">
        <path d="M14 50 C30 24 54 24 74 38" fill="none" stroke={theme.cyan} strokeWidth="4" strokeDasharray="110" strokeDashoffset={110 * (1 - p)} />
        <circle cx={interpolate(p, [0, 1], [14, 74])} cy={interpolate(p, [0, 1], [50, 38])} r="8" fill={theme.goldLight} opacity="0.92" />
      </svg>
    );
  }
  if (type === 'knowledge') {
    return (
      <div style={{ width: 86, height: 72, perspective: 300 }}>
        <div style={{ width: 72, height: 58, border: `1px solid ${theme.goldLight}`, borderRadius: 8, background: 'rgba(255,230,173,0.10)', transform: `rotateY(${interpolate(p, [0, 1], [-68, 0])}deg)`, padding: 9 }}>
          <div style={{ height: 6, background: theme.goldLight, marginBottom: 8, opacity: 0.8 }} />
          <div style={{ height: 5, background: theme.cyan, marginBottom: 6, opacity: 0.65 }} />
          <div style={{ height: 5, background: theme.cyan, width: 42, opacity: 0.42 }} />
        </div>
      </div>
    );
  }
  if (type === 'paint') {
    return (
      <svg width="88" height="82" viewBox="0 0 88 82">
        <path d="M26 18 C48 10 66 26 62 50 C58 68 34 70 25 53 C18 40 16 27 26 18 Z" fill="none" stroke={theme.goldLight} strokeWidth="3" opacity="0.82" />
        <path d="M25 46 C38 30 52 30 64 44" fill="none" stroke={theme.red} strokeWidth="5" strokeLinecap="round" strokeDasharray="70" strokeDashoffset={70 * (1 - p)} />
      </svg>
    );
  }
  return (
    <div style={{ width: 82, height: 82, transform: `rotateY(${interpolate(p, [0, 1], [-40, 28])}deg)` }}>
      <Img src={staticFile('zhangfei.png')} style={{ width: 82, height: 82, objectFit: 'contain', filter: 'drop-shadow(0 0 16px rgba(32,215,232,0.28))' }} />
    </div>
  );
};

const FeatureModule = ({ title, type, angle, delay, index }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, delay, 22);
  const cx = 960;
  const cy = 565;
  const rad = (angle * Math.PI) / 180;
  const left = cx + Math.cos(rad) * 610 - 130;
  const top = cy + Math.sin(rad) * 275 - 78;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: 260,
        height: 156,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [34, 0])}px) scale(${interpolate(p, [0, 1], [0.78, 1])})`,
        border: '1px solid rgba(32,215,232,0.42)',
        borderRadius: 18,
        background: 'linear-gradient(135deg, rgba(7,15,26,0.88), rgba(7,9,14,0.62))',
        boxShadow: '0 24px 70px rgba(0,0,0,0.34), inset 0 0 26px rgba(32,215,232,0.07)',
        overflow: 'hidden',
        zIndex: 58,
      }}
    >
      <div style={{ position: 'absolute', left: 18, top: 16, color: theme.cyan, fontSize: 16, fontWeight: 900, opacity: 0.7 }}>FUNC 0{index}</div>
      <div style={{ position: 'absolute', right: 18, top: 20 }}>
        <MiniFeatureVisual type={type} p={p} />
      </div>
      <div style={{ position: 'absolute', left: 20, bottom: 22, color: theme.goldLight, fontSize: 26, fontWeight: 950 }}>{title}</div>
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: `${p * 100}%`, height: 3, background: `linear-gradient(90deg, ${theme.cyan}, ${theme.goldLight})` }} />
    </div>
  );
};

const SolutionWebMockup = ({ p }) => (
  <div
    style={{
      position: 'absolute',
      left: 550,
      top: 278,
      width: 820,
      height: 430,
      opacity: p,
      transform: `scale(${interpolate(p, [0, 1], [0.78, 1])}) translateY(${interpolate(p, [0, 1], [40, 0])}px)`,
      borderRadius: 26,
      border: '1px solid rgba(32,215,232,0.42)',
      background: 'linear-gradient(180deg, rgba(7,13,22,0.94), rgba(4,7,13,0.84))',
      boxShadow: '0 34px 110px rgba(0,0,0,0.52), 0 0 70px rgba(32,215,232,0.12)',
      overflow: 'hidden',
      zIndex: 45,
    }}
  >
    <Img src={staticFile('cover-reference-wide.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.38, filter: 'saturate(1.06) brightness(0.62)' }} />
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(4,7,13,0.9), rgba(4,7,13,0.32) 62%, rgba(4,7,13,0.82))' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: 'linear-gradient(180deg, transparent, rgba(4,7,13,0.96) 36%, #04070d 100%)' }} />
    <div style={{ position: 'absolute', left: 44, top: 42, color: theme.goldLight, fontSize: 26, fontWeight: 900 }}>AI-Opera 智能川剧变脸</div>
    <div style={{ position: 'absolute', left: 44, top: 104, color: theme.text, fontSize: 54, fontWeight: 950, lineHeight: 1.12 }}>
      让脸谱从观看<br />走向参与
    </div>
    <div style={{ position: 'absolute', left: 44, bottom: 44, padding: '13px 20px', borderRadius: 999, color: '#241405', background: `linear-gradient(135deg, ${theme.goldLight}, ${theme.gold})`, fontSize: 23, fontWeight: 950 }}>
      不是滤镜，而是完整 Web 互动应用
    </div>
    <div style={{ position: 'absolute', right: 62, top: 88 }}>
      <MaskModel src="guanyu.png" size={250} frameOffset={140} />
    </div>
  </div>
);

const Scene_AIOperaPositioning = () => {
  const frame = useCurrentFrame();
  const activate = progress(frame, 6, 34);
  const web = progress(frame, 32, 34);
  const loop = progress(frame, 138, 44);
  const features = [
    ['佩戴脸谱', 'wear', -158],
    ['触发变脸', 'gesture', -74],
    ['了解角色', 'knowledge', 0],
    ['参与绘制', 'paint', 74],
    ['生成三维模型', 'model', 158],
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: 'hidden' }}>
      <StageBackground intensity={1.08} />
      <SceneTitleBlock title="AI-Opera，让脸谱从观看走向参与" sub="佩戴｜触发｜了解｜绘制｜生成" width={1240} />
      <div
        style={{
          position: 'absolute',
          left: 900,
          top: 506,
          width: 120,
          height: 120,
          borderRadius: 999,
          opacity: 1 - activate,
          background: 'radial-gradient(circle, #ff4a38 0%, rgba(217,45,32,0.42) 38%, transparent 70%)',
          boxShadow: '0 0 80px rgba(217,45,32,0.72)',
          display: 'grid',
          placeItems: 'center',
          color: theme.text,
          fontSize: 21,
          fontWeight: 950,
          zIndex: 50,
        }}
      >
        待解决
      </div>
      <div
        style={{
          position: 'absolute',
          left: 640 - activate * 320,
          top: 500,
          width: 640 + activate * 640,
          height: 90,
          opacity: activate,
          background: `linear-gradient(90deg, transparent, ${theme.cyan}, ${theme.goldLight}, ${theme.cyan}, transparent)`,
          filter: 'blur(8px)',
          mixBlendMode: 'screen',
          transform: `rotate(${interpolate(activate, [0, 1], [-8, 0])}deg)`,
          zIndex: 44,
        }}
      />
      <SolutionWebMockup p={web} />
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity: web, zIndex: 42 }}>
        <ellipse
          cx="960"
          cy="565"
          rx="618"
          ry="276"
          fill="none"
          stroke="rgba(32,215,232,0.34)"
          strokeWidth="2"
          strokeDasharray="2800"
          strokeDashoffset={2800 * (1 - loop)}
        />
        <ellipse
          cx="960"
          cy="565"
          rx="648"
          ry="300"
          fill="none"
          stroke="rgba(255,230,173,0.22)"
          strokeWidth="1"
          strokeDasharray="18 18"
          strokeDashoffset={-frame * 6}
        />
      </svg>
      {features.map(([title, type, angle], i) => (
        <FeatureModule key={title} title={title} type={type} angle={angle} delay={58 + i * 17} index={i + 1} />
      ))}
      <div
        style={{
          position: 'absolute',
          left: 746,
          bottom: 80,
          width: 430,
          height: 58,
          borderRadius: 999,
          opacity: loop,
          background: `linear-gradient(90deg, rgba(32,215,232,0.18), rgba(255,230,173,0.30), rgba(32,215,232,0.18))`,
          border: '1px solid rgba(255,230,173,0.36)',
          boxShadow: '0 0 50px rgba(32,215,232,0.18)',
          display: 'grid',
          placeItems: 'center',
          color: theme.goldLight,
          fontSize: 26,
          fontWeight: 950,
        }}
      >
        完整数字文化体验
      </div>
      <ScanTransition delay={178} />
    </AbsoluteFill>
  );
};

const PositioningScene = () => (
  <SceneShell
    caption="从观看脸谱，到参与脸谱"
    sub="佩戴｜触发｜了解｜绘制｜生成三维模型"
    intensity={1}
  >
    <ProductMock />
    <div style={{ position: 'absolute', left: 118, top: 286, width: 650, height: 440 }}>
      <Img
        src={staticFile('cover-reference-wide.png')}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 24,
          opacity: 0.8,
          boxShadow: '0 28px 90px rgba(0,0,0,0.46)',
          border: `1px solid rgba(255,230,173,0.24)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 220,
          borderRadius: '0 0 24px 24px',
          background: 'linear-gradient(180deg, rgba(4,7,13,0.96), #04070d 100%)',
        }}
      />
    </div>
  </SceneShell>
);

const ProblemCard = ({ title, image, left, delay, body }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, delay, 22);
  return (
    <HUDFrame
      style={{
        left,
        top: 290,
        width: 500,
        height: 486,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [44, 0])}px)`,
      }}
    >
      <Img
        src={staticFile(image)}
        style={{
          width: '100%',
          height: 310,
          objectFit: 'cover',
          opacity: 0.72,
          filter: 'saturate(0.85) contrast(1.05) brightness(0.78)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 36%, rgba(5,7,12,0.96) 70%)' }} />
      <div style={{ position: 'absolute', left: 30, right: 30, bottom: 36 }}>
        <div style={{ color: theme.goldLight, fontSize: 42, fontWeight: 900 }}>{title}</div>
        <div style={{ marginTop: 12, color: theme.muted, fontSize: 22, lineHeight: 1.55 }}>{body}</div>
      </div>
    </HUDFrame>
  );
};

const PainScene = () => {
  const frame = useCurrentFrame();
  return (
    <SceneShell caption="传统数字化体验，仍然不够深入" sub="体验浅｜参与弱｜留存低" intensity={0.95}>
        <ProblemCard
          title="体验浅"
          body="二维贴图漂浮在人脸上，面部细节和表情难以真实贴合。"
          image="ppt-image15.png"
          left={150}
          delay={20}
        />
        <ProblemCard
          title="参与弱"
          body="专业软件门槛高，普通用户很难进入创作和互动流程。"
          image="ppt-image13.png"
          left={710}
          delay={38}
        />
        <ProblemCard
          title="留存低"
          body="一次性滤镜看完即走，缺少知识沉淀与个人数字资产。"
          image="ppt-image14.png"
          left={1270}
          delay={56}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 820,
            width: '100%',
            height: 4,
            background: `linear-gradient(90deg, transparent, ${theme.cyan}, ${theme.goldLight}, transparent)`,
            transform: `translateX(${interpolate(frame, [96, 138], [-1920, 1920], clamp)}px)`,
            filter: `drop-shadow(0 0 18px ${theme.cyan})`,
          }}
        />
    </SceneShell>
  );
};

const TechLayer = ({ index, title, body, top, delay }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, delay, 24);
  return (
    <div
      style={{
        position: 'absolute',
        left: 158,
        top,
        width: 760,
        minHeight: 112,
        padding: '22px 28px',
        borderRadius: 18,
        border: `1px solid rgba(32,215,232,${0.16 + p * 0.22})`,
        background: `linear-gradient(90deg, rgba(217,45,32,${0.06 + index * 0.02}), rgba(10,20,32,0.74))`,
        opacity: p,
        transform: `translateX(${interpolate(p, [0, 1], [-70, 0])}px)`,
        boxShadow: '0 24px 70px rgba(0,0,0,0.34)',
      }}
    >
      <div style={{ color: theme.cyan, fontSize: 20, fontWeight: 900 }}>0{index}</div>
      <div style={{ color: theme.text, fontSize: 34, fontWeight: 900, marginTop: 3 }}>{title}</div>
      <div style={{ color: theme.muted, fontSize: 22, lineHeight: 1.45, marginTop: 8 }}>{body}</div>
    </div>
  );
};

const AdvantageScene = () => {
  const frame = useCurrentFrame();
  const uv = progress(frame, 64, 40);
  return (
    <SceneShell caption="文化内容 × 实时交互 × 三维个性化" sub="从“千人一面”走向“千人千面”" intensity={1.05}>
      <TechLayer index={1} title="人脸追踪 + 手势识别 + 头部姿态" body="MediaPipe Face Mesh 与 Hands 捕捉实时输入。" top={255} delay={18} />
      <TechLayer index={2} title="3DDFA-V3 个性化三维人脸建模" body="基于用户脸型重建 OBJ，保留轮廓与起伏。" top={400} delay={38} />
      <TechLayer index={3} title="陈列馆 + 角色知识页 + 绘制流程" body="从体验结果沉淀为可复用文化资产。" top={545} delay={58} />
      <div style={{ position: 'absolute', right: 220, top: 225, width: 560, height: 620, display: 'grid', placeItems: 'center' }}>
        <FaceMesh width={470} height={570} opacity={1 - uv * 0.62} />
        <div style={{ position: 'absolute', opacity: uv }}>
          <MaskModel src="guanyu.png" size={470} frameOffset={80} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 28,
            top: 52,
            width: 510,
            height: 510,
            borderRadius: 999,
            border: `1px solid rgba(255,230,173,${0.18 + uv * 0.3})`,
            transform: `rotate(${frame * 0.35}deg)`,
            opacity: 0.55,
          }}
        />
      </div>
    </SceneShell>
  );
};

const ScenarioScene = () => {
  const frame = useCurrentFrame();
  const cards = [
    ['校园展示', '比赛答辩 / 社团活动', 'ppt-image12.png'],
    ['非遗展陈', 'AR 佩戴 / 三维陈列', 'ppt-image30.jpeg'],
    ['科普教育', '故事 / 寓意 / 绘制', 'ppt-image3.jpeg'],
    ['数字文旅', '景区 / 博物馆 / 线上活动', 'main_poster_3d.png'],
  ];
  return (
    <SceneShell caption="低门槛、强互动、可留存" sub="校园展示｜非遗展陈｜科普教育｜数字文旅" intensity={1}>
      {cards.map(([title, body, img], i) => {
        const p = progress(frame, 18 + i * 12, 24);
        const x = [135, 535, 935, 1335][i];
        const y = i % 2 === 0 ? 304 : 388;
        return (
          <HUDFrame
            key={title}
            style={{
              left: x,
              top: y,
              width: 350,
              height: 350,
              opacity: p,
              transform: `translate(${interpolate(p, [0, 1], [i < 2 ? -46 : 46, 0])}px, ${interpolate(p, [0, 1], [36, 0])}px)`,
            }}
          >
            <Img src={staticFile(img)} style={{ width: '100%', height: 210, objectFit: 'cover', opacity: 0.72 }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 34%, rgba(4,7,13,0.95) 70%)' }} />
            <div style={{ position: 'absolute', left: 24, bottom: 26 }}>
              <div style={{ color: theme.goldLight, fontSize: 34, fontWeight: 900 }}>{title}</div>
              <div style={{ color: theme.muted, fontSize: 20, marginTop: 9 }}>{body}</div>
            </div>
          </HUDFrame>
        );
      })}
      <div style={{ position: 'absolute', left: 650, top: 270, width: 620, height: 470, opacity: 0.84 }}>
        <ProductMock x={650} y={270} scale={0.82} />
      </div>
    </SceneShell>
  );
};

const CultureScene = () => {
  const frame = useCurrentFrame();
  const drawP = progress(frame, 22, 68);
  const linkP = progress(frame, 66, 36);
  return (
    <SceneShell caption="守住非遗本体，更新表达方式" sub="从线稿到上色，从二维图案到三维模型" intensity={1.08}>
      <HUDFrame style={{ left: 145, top: 250, width: 650, height: 555 }}>
        <div style={{ position: 'absolute', left: 38, top: 34, color: theme.goldLight, fontSize: 28, fontWeight: 900 }}>传统创作逻辑</div>
        <svg width="520" height="420" viewBox="0 0 520 420" style={{ position: 'absolute', left: 66, top: 96 }}>
          <path
            d="M260 35 C120 42 68 152 88 248 C108 345 190 386 260 390 C330 386 412 345 432 248 C452 152 400 42 260 35 Z"
            fill="none"
            stroke={theme.goldLight}
            strokeWidth="5"
            strokeDasharray="1260"
            strokeDashoffset={1260 * (1 - drawP)}
          />
          <path d="M145 176 C190 132 228 158 242 190" fill="none" stroke={theme.red} strokeWidth="8" strokeDasharray="330" strokeDashoffset={330 * (1 - drawP)} />
          <path d="M375 176 C330 132 292 158 278 190" fill="none" stroke={theme.red} strokeWidth="8" strokeDasharray="330" strokeDashoffset={330 * (1 - drawP)} />
          <path d="M172 276 C220 310 300 310 348 276" fill="none" stroke={theme.cyan} strokeWidth="7" strokeDasharray="310" strokeDashoffset={310 * (1 - drawP)} />
          <path d="M260 72 L260 348" stroke={theme.goldLight} strokeWidth="3" opacity="0.64" strokeDasharray="276" strokeDashoffset={276 * (1 - drawP)} />
        </svg>
      </HUDFrame>
      <div
        style={{
          position: 'absolute',
          left: 795,
          top: 510,
          width: 330,
          height: 4,
          background: `linear-gradient(90deg, ${theme.goldLight}, ${theme.cyan})`,
          opacity: linkP,
          transform: `scaleX(${linkP})`,
          transformOrigin: 'left center',
          boxShadow: `0 0 22px ${theme.goldLight}`,
        }}
      />
      <HUDFrame style={{ right: 140, top: 250, width: 650, height: 555 }}>
        <div style={{ position: 'absolute', left: 38, top: 34, color: theme.goldLight, fontSize: 28, fontWeight: 900 }}>数字三维资产</div>
        <div style={{ position: 'absolute', left: 115, top: 102 }}>
          <MaskModel src="zhangfei.png" size={420} frameOffset={120} />
        </div>
      </HUDFrame>
    </SceneShell>
  );
};

const FinaleScene = () => {
  const frame = useCurrentFrame();
  const items = [
    ['挥手变脸', 'guanyu.png'],
    ['侧头火光', 'ppt-image18.png'],
    ['脸谱陈列馆', 'ppt-image2.png'],
    ['OBJ 旋转', 'zhangfei.png'],
    ['文化知识', 'ppt-image30.jpeg'],
  ];
  const gather = progress(frame, 58, 46);
  return (
    <SceneShell caption="让每一次变脸，都成为一次非遗创造" sub="AI-Opera 智能川剧变脸" align="center" intensity={1.16}>
      {items.map(([label, img], i) => {
        const angle = (Math.PI * 2 * i) / items.length - Math.PI / 2;
        const startX = 250 + i * 340;
        const startY = i % 2 ? 268 : 420;
        const endX = 960 + Math.cos(angle) * 285;
        const endY = 405 + Math.sin(angle) * 150;
        const p = progress(frame, 12 + i * 5, 24);
        const x = interpolate(gather, [0, 1], [startX, endX]);
        const y = interpolate(gather, [0, 1], [startY, endY]);
        return (
          <HUDFrame
            key={label}
            style={{
              left: x,
              top: y,
              width: 238,
              height: 176,
              opacity: p * (1 - gather * 0.05),
              transform: `rotate(${interpolate(gather, [0, 1], [i % 2 ? 4 : -4, 0])}deg) scale(${interpolate(gather, [0, 1], [1, 0.88])})`,
            }}
          >
            <Img src={staticFile(img)} style={{ width: '100%', height: 122, objectFit: 'cover', opacity: 0.76 }} />
            <div style={{ position: 'absolute', left: 18, bottom: 16, color: theme.goldLight, fontSize: 20, fontWeight: 900 }}>{label}</div>
          </HUDFrame>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 718,
          top: 184,
          opacity: gather,
          transform: `scale(${interpolate(gather, [0, 1], [0.76, 1])})`,
        }}
      >
        <MaskModel src="guanyu.png" size={480} frameOffset={40} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 616,
          top: 118,
          width: 690,
          height: 690,
          borderRadius: 999,
          border: `1px solid rgba(32,215,232,${0.2 + gather * 0.3})`,
          boxShadow: `0 0 ${interpolate(gather, [0, 1], [0, 70])}px rgba(32,215,232,0.22)`,
          transform: `scale(${interpolate(gather, [0, 1], [0.85, 1])}) rotate(${frame * 0.25}deg)`,
          opacity: gather * 0.68,
        }}
      />
    </SceneShell>
  );
};

const scenes = [
  { Component: CoverScene, duration: SCENE },
  { Component: Scene_BackgroundChallenge, duration: CHALLENGE_SCENE },
  { Component: Scene_AIOperaPositioning, duration: POSITIONING_SCENE },
  { Component: AdvantageScene, duration: SCENE },
  { Component: ScenarioScene, duration: SCENE },
  { Component: CultureScene, duration: SCENE },
  { Component: FinaleScene, duration: SCENE },
];

const sceneTimeline = scenes.reduce((acc, scene) => {
  const from = acc.length === 0 ? 0 : acc[acc.length - 1].from + acc[acc.length - 1].duration;
  acc.push({ ...scene, from });
  return acc;
}, []);

export const AIOperaPromo = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const bgmVolume = interpolate(frame, [0, 30, DURATION - 60, DURATION], [0, 0.14, 0.14, 0], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Audio src={staticFile('opera-background.mp3')} volume={bgmVolume} />
      <Audio src={staticFile('ai-opera-promo-voice.wav')} volume={1} />
      {sceneTimeline.map(({ Component, from, duration }, index) => (
        <Sequence key={index} from={from} durationInFrames={duration} premountFor={fps}>
          <Component />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
