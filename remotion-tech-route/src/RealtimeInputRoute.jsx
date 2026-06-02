import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const gold = '#d7a84a';
const cream = '#f2e8d5';
const cyan = '#20d7e8';
const red = '#d92d20';

const facePoints = [
  [0.5, 0.1], [0.4, 0.12], [0.6, 0.12], [0.32, 0.18], [0.68, 0.18],
  [0.26, 0.3], [0.74, 0.3], [0.22, 0.46], [0.78, 0.46], [0.28, 0.64],
  [0.72, 0.64], [0.38, 0.78], [0.62, 0.78], [0.5, 0.86], [0.5, 0.31],
  [0.45, 0.38], [0.55, 0.38], [0.5, 0.5], [0.42, 0.57], [0.58, 0.57],
  [0.36, 0.29], [0.42, 0.26], [0.48, 0.29], [0.52, 0.29], [0.58, 0.26],
  [0.64, 0.29], [0.39, 0.66], [0.46, 0.69], [0.54, 0.69], [0.61, 0.66],
  [0.44, 0.7], [0.56, 0.7], [0.36, 0.21], [0.44, 0.2], [0.56, 0.2],
  [0.64, 0.21], [0.31, 0.55], [0.69, 0.55], [0.34, 0.43], [0.66, 0.43],
  [0.46, 0.47], [0.54, 0.47], [0.47, 0.58], [0.53, 0.58], [0.5, 0.68],
  [0.41, 0.34], [0.59, 0.34], [0.34, 0.7], [0.66, 0.7],
];

const handPoints = [
  [0.12, 0.76], [0.18, 0.67], [0.25, 0.59], [0.31, 0.52], [0.38, 0.45],
  [0.26, 0.66], [0.36, 0.59], [0.46, 0.53], [0.56, 0.47],
  [0.28, 0.73], [0.41, 0.68], [0.53, 0.62], [0.65, 0.55],
  [0.28, 0.8], [0.42, 0.78], [0.55, 0.75], [0.69, 0.7],
  [0.25, 0.87], [0.38, 0.88], [0.52, 0.88], [0.66, 0.86],
];

const handBones = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
];

const faceLines = [
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8],
  [7, 9], [8, 10], [9, 11], [10, 12], [11, 13], [12, 13],
  [20, 21], [21, 22], [23, 24], [24, 25], [14, 17], [17, 18], [17, 19],
  [26, 27], [27, 28], [28, 29], [30, 31], [38, 40], [39, 41],
  [42, 44], [43, 44], [15, 16], [18, 42], [19, 43],
];

const stages = [
  { label: 'RGB VIDEO STREAM', cn: '摄像头连续帧', start: 20, end: 210 },
  { label: 'FACE ROI', cn: 'BlazeFace 快速定位', start: 180, end: 390 },
  { label: '468 3D LANDMARKS', cn: 'Face Mesh 稠密关键点', start: 360, end: 720 },
  { label: '21 HAND POINTS', cn: 'MediaPipe Hands 手部识别', start: 620, end: 960 },
  { label: 'EVENT ROUTER', cn: '挥手 / 遮脸 / 举手判断', start: 880, end: 1260 },
];

const NarrativeLine = ({ children, start, end, top }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + 20, end - 20, end], [0, 1, 1, 0], clamp);
  const y = interpolate(frame, [start, start + 22], [24, 0], { ...clamp, easing: ease });
  return (
    <div style={{
      position: 'absolute',
      left: 120,
      top,
      width: 960,
      opacity,
      transform: `translateY(${y}px)`,
      color: cream,
      fontSize: 38,
      lineHeight: 1.52,
      fontWeight: 650,
      textShadow: '0 4px 18px rgba(0,0,0,0.85)',
      zIndex: 10,
    }}>
      {children}
    </div>
  );
};

const GridBackground = () => {
  const frame = useCurrentFrame();
  const drift = frame * 0.4;
  const pulse = interpolate(Math.sin(frame / 28), [-1, 1], [0.15, 0.32]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#05070c', overflow: 'hidden' }}>
      <Img
        src={staticFile('gallary_bg.png')}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.32,
          filter: 'saturate(0.9) contrast(1.04) brightness(0.6)',
          transform: `scale(${1.03 + frame * 0.00004})`,
        }}
      />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(circle at 17% 20%, rgba(217,45,32,0.25), transparent 23%),
          radial-gradient(circle at 76% 28%, rgba(32,215,232,0.2), transparent 24%),
          radial-gradient(circle at 60% 82%, rgba(215,168,74,0.18), transparent 26%),
          linear-gradient(180deg, rgba(5,7,12,0.24), rgba(5,7,12,0.96))
        `,
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: pulse,
        backgroundImage: `
          linear-gradient(rgba(32,215,232,0.26) 1px, transparent 1px),
          linear-gradient(90deg, rgba(32,215,232,0.22) 1px, transparent 1px)
        `,
        backgroundSize: '72px 72px',
        backgroundPosition: `${-drift}px ${drift * 0.45}px`,
        maskImage: 'radial-gradient(circle at center, black 0%, black 64%, transparent 94%)',
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.14,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(242,232,213,0.22) 0, rgba(242,232,213,0.22) 1px, transparent 1px, transparent 5px)',
      }} />
      <div style={{
        position: 'absolute',
        left: 44,
        top: 38,
        width: 360,
        height: 360,
        borderLeft: `1px solid rgba(215,168,74,0.52)`,
        borderTop: `1px solid rgba(215,168,74,0.52)`,
      }} />
      <div style={{
        position: 'absolute',
        right: 44,
        bottom: 38,
        width: 360,
        height: 360,
        borderRight: `1px solid rgba(215,168,74,0.52)`,
        borderBottom: `1px solid rgba(215,168,74,0.52)`,
      }} />
    </AbsoluteFill>
  );
};

const Title = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 25, 1220, 1310], [0, 1, 1, 0], clamp);
  const x = interpolate(frame, [0, 28], [-40, 0], { ...clamp, easing: ease });
  return (
    <div style={{ position: 'absolute', left: 96, top: 70, zIndex: 20, opacity, transform: `translateX(${x}px)` }}>
      <div style={{ color: cyan, fontSize: 25, fontWeight: 800, letterSpacing: 0, textShadow: `0 0 22px ${cyan}` }}>
        AI-Opera 技术路线 / Real-time Input & Tracking
      </div>
      <div style={{
        marginTop: 10,
        fontFamily: '"Source Han Serif SC", SimSun, serif',
        color: cream,
        fontSize: 58,
        fontWeight: 800,
        letterSpacing: 0,
        textShadow: '0 0 26px rgba(215,168,74,0.26), 0 8px 26px rgba(0,0,0,0.72)',
      }}>
        摄像头输入到 468 点人脸追踪
      </div>
    </div>
  );
};

const CameraStream = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [20, 80], [0, 1], { ...clamp, easing: ease });
  const scan = ((frame - 40) * 8) % 520;
  const flicker = interpolate(Math.sin(frame / 5), [-1, 1], [0.86, 1]);
  const zoom = 1.02 + interpolate(frame, [80, 340], [0, 0.035], clamp);
  return (
    <div style={{
      position: 'absolute',
      left: 100,
      top: 260,
      width: 485,
      height: 520,
      zIndex: 5,
      opacity: enter,
      transform: `translateX(${interpolate(frame, [20, 80], [-60, 0], { ...clamp, easing: ease })}px)`,
    }}>
      <Panel title="01 摄像头输入" subtitle="连续 RGB 视频帧" />
      <div style={{
        position: 'absolute',
        inset: 52,
        overflow: 'hidden',
        border: `1px solid rgba(32,215,232,${0.38 * flicker})`,
        borderRadius: 8,
        backgroundColor: '#06090d',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5), inset 0 0 34px rgba(32,215,232,0.12)',
      }}>
        <Img src={staticFile('real-face.png')} style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'saturate(0.85) contrast(1.04) brightness(0.92)',
          transform: `scale(${zoom}) translateY(${Math.sin(frame / 34) * 4}px)`,
        }} />
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: scan - 24,
          height: 42,
          background: 'linear-gradient(180deg, transparent, rgba(32,215,232,0.42), transparent)',
          mixBlendMode: 'screen',
        }} />
        <HudCorners />
      </div>
      <DataTicker start={70} label="RGB / 30FPS / CAMERA READY" />
    </div>
  );
};

const Panel = ({ title, subtitle }) => (
  <div style={{
    position: 'absolute',
    inset: 0,
    border: '1px solid rgba(127,229,255,0.22)',
    borderRadius: 16,
    background: 'linear-gradient(180deg, rgba(8,14,24,0.76), rgba(4,7,13,0.5))',
    boxShadow: '0 28px 80px rgba(0,0,0,0.34)',
  }}>
    <div style={{
      position: 'absolute',
      left: 22,
      top: 16,
      color: gold,
      fontSize: 23,
      fontWeight: 900,
      fontFamily: '"Source Han Serif SC", SimSun, serif',
    }}>{title}</div>
    <div style={{ position: 'absolute', right: 22, top: 20, color: 'rgba(242,232,213,0.62)', fontSize: 16 }}>{subtitle}</div>
  </div>
);

const HudCorners = () => (
  <>
    {[['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']].map(([x, y]) => (
      <div key={`${x}-${y}`} style={{
        position: 'absolute',
        [x]: 14,
        [y]: 14,
        width: 42,
        height: 42,
        borderColor: cyan,
        borderStyle: 'solid',
        borderWidth: `${y === 'top' ? 2 : 0}px ${x === 'right' ? 2 : 0}px ${y === 'bottom' ? 2 : 0}px ${x === 'left' ? 2 : 0}px`,
        opacity: 0.86,
      }} />
    ))}
  </>
);

const DataTicker = ({ start, label }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + 16], [0, 1], clamp);
  const width = interpolate(frame, [start, start + 60], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{
      position: 'absolute',
      left: 54,
      right: 54,
      bottom: 26,
      height: 32,
      opacity,
      color: cyan,
      fontSize: 15,
      fontFamily: 'Consolas, monospace',
      letterSpacing: 0,
      overflow: 'hidden',
    }}>
      <div style={{ transform: `scaleX(${width})`, transformOrigin: 'left', height: 1, background: 'rgba(32,215,232,0.65)', marginBottom: 8 }} />
      {label}
    </div>
  );
};

const FaceRoi = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [150, 210, 560, 620], [0, 1, 1, 0], clamp);
  const progress = interpolate(frame, [180, 270], [0, 1], { ...clamp, easing: ease });
  const pulse = interpolate(Math.sin(frame / 12), [-1, 1], [0.35, 0.85]);
  return (
    <div style={{
      position: 'absolute',
      left: 520,
      top: 256,
      width: 500,
      height: 530,
      zIndex: 7,
      opacity,
      transform: `translateX(${interpolate(frame, [150, 210], [40, 0], { ...clamp, easing: ease })}px)`,
    }}>
      <Panel title="02 BlazeFace ROI" subtitle="快速定位人脸区域" />
      <div style={{
        position: 'absolute',
        left: 74,
        top: 86,
        width: 350,
        height: 365,
        border: `2px solid rgba(215,168,74,${pulse})`,
        boxShadow: `0 0 ${34 + pulse * 26}px rgba(215,168,74,0.24), inset 0 0 30px rgba(215,168,74,0.08)`,
        borderRadius: 10,
      }} />
      <div style={{
        position: 'absolute',
        left: 74,
        top: 86,
        width: 350 * progress,
        height: 365,
        borderTop: `4px solid ${gold}`,
        borderBottom: `4px solid ${gold}`,
        opacity: 0.95,
      }} />
      <div style={{ position: 'absolute', left: 94, top: 110, color: gold, fontFamily: 'Consolas, monospace', fontSize: 18 }}>
        ROI LOCKED / confidence {(94 + Math.round(pulse * 4)).toString()}%
      </div>
      <MetricStack start={230} items={['detect face', 'crop ROI', 'normalize input']} />
    </div>
  );
};

const MetricStack = ({ start, items }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 70, right: 70, bottom: 58, display: 'grid', gap: 8 }}>
      {items.map((item, index) => {
        const opacity = interpolate(frame, [start + index * 18, start + index * 18 + 18], [0, 1], clamp);
        const x = interpolate(frame, [start + index * 18, start + index * 18 + 18], [-18, 0], { ...clamp, easing: ease });
        return (
          <div key={item} style={{
            opacity,
            transform: `translateX(${x}px)`,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'rgba(242,232,213,0.84)',
            fontSize: 16,
            fontFamily: 'Consolas, monospace',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: cyan, boxShadow: `0 0 12px ${cyan}` }} />
            {item}
          </div>
        );
      })}
    </div>
  );
};

const FaceMesh = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [330, 395, 960, 1030], [0, 1, 1, 0.72], clamp);
  const nodeProgress = interpolate(frame, [405, 600], [0, facePoints.length], clamp);
  const lineProgress = interpolate(frame, [480, 660], [0, faceLines.length], clamp);
  const rotate = Math.sin(frame / 55) * 6;
  return (
    <div style={{
      position: 'absolute',
      left: 855,
      top: 205,
      width: 590,
      height: 650,
      zIndex: 9,
      opacity,
      transform: `perspective(900px) rotateY(${rotate}deg) translateX(${interpolate(frame, [330, 395], [80, 0], { ...clamp, easing: ease })}px)`,
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 28,
        background: 'radial-gradient(circle at 50% 48%, rgba(32,215,232,0.12), transparent 58%)',
      }} />
      <div style={{
        position: 'absolute',
        left: 52,
        top: 44,
        color: cyan,
        fontSize: 25,
        fontWeight: 900,
        fontFamily: '"Source Han Serif SC", SimSun, serif',
        textShadow: `0 0 18px ${cyan}`,
      }}>
        03 MediaPipe Face Mesh
      </div>
      <svg width="590" height="650" viewBox="0 0 590 650" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="faceGlow" cx="50%" cy="42%">
            <stop offset="0%" stopColor="rgba(32,215,232,0.3)" />
            <stop offset="100%" stopColor="rgba(32,215,232,0)" />
          </radialGradient>
        </defs>
        <ellipse cx="300" cy="330" rx="190" ry="255" fill="url(#faceGlow)" stroke="rgba(32,215,232,0.34)" strokeWidth="2" />
        {faceLines.map(([a, b], index) => {
          const show = index < lineProgress;
          const [ax, ay] = facePoints[a];
          const [bx, by] = facePoints[b];
          return (
            <line
              key={`${a}-${b}`}
              x1={160 + ax * 280}
              y1={70 + ay * 500}
              x2={160 + bx * 280}
              y2={70 + by * 500}
              stroke={show ? 'rgba(32,215,232,0.68)' : 'rgba(32,215,232,0)'}
              strokeWidth="2"
            />
          );
        })}
        {facePoints.map(([x, y], index) => {
          const show = index < nodeProgress;
          const jitter = Math.sin((frame + index * 13) / 17) * 2;
          return (
            <circle
              key={index}
              cx={160 + x * 280 + jitter}
              cy={70 + y * 500 + Math.cos((frame + index * 9) / 19) * 1.4}
              r={show ? 4.5 : 0}
              fill={index % 5 === 0 ? gold : cyan}
              opacity={show ? 0.98 : 0}
            />
          );
        })}
      </svg>
      <div style={{
        position: 'absolute',
        right: 52,
        bottom: 66,
        padding: '13px 18px',
        border: '1px solid rgba(32,215,232,0.34)',
        borderRadius: 999,
        color: cream,
        background: 'rgba(5,12,18,0.76)',
        fontSize: 23,
        fontWeight: 800,
      }}>
        468 个三维稠密关键点
      </div>
    </div>
  );
};

const HandTracking = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [610, 680, 1170, 1230], [0, 1, 1, 0], clamp);
  const handX = interpolate(frame, [690, 930], [0, 240], { ...clamp, easing: Easing.bezier(0.45, 0, 0.16, 1) });
  const progress = interpolate(frame, [720, 860], [0, handPoints.length], clamp);
  return (
    <div style={{
      position: 'absolute',
      right: 90,
      top: 280,
      width: 475,
      height: 500,
      zIndex: 12,
      opacity,
      transform: `translateX(${interpolate(frame, [610, 680], [60, 0], { ...clamp, easing: ease })}px)`,
    }}>
      <Panel title="04 MediaPipe Hands" subtitle="21 个手部三维关键点" />
      <svg width="475" height="500" viewBox="0 0 475 500" style={{ position: 'absolute', inset: 0, transform: `translateX(${handX - 110}px)` }}>
        {handBones.map(([a, b], index) => {
          const show = index < progress;
          const [ax, ay] = handPoints[a];
          const [bx, by] = handPoints[b];
          return (
            <line
              key={`${a}-${b}`}
              x1={80 + ax * 340}
              y1={62 + ay * 360}
              x2={80 + bx * 340}
              y2={62 + by * 360}
              stroke={show ? 'rgba(242,232,213,0.66)' : 'transparent'}
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })}
        {handPoints.map(([x, y], index) => {
          const show = index < progress;
          return (
            <circle
              key={index}
              cx={80 + x * 340}
              cy={62 + y * 360}
              r={show ? 5.2 : 0}
              fill={index === 0 ? red : gold}
              opacity={show ? 1 : 0}
            />
          );
        })}
      </svg>
      <div style={{
        position: 'absolute',
        left: 56,
        bottom: 58,
        width: 360,
        color: cream,
        fontSize: 21,
        lineHeight: 1.54,
      }}>
        识别挥手、遮脸、举手等动作，为变脸、舞扇与吐火提供触发信号。
      </div>
    </div>
  );
};

const FlowBeams = () => {
  const frame = useCurrentFrame();
  const beamA = interpolate(frame, [80, 250], [0, 1], clamp);
  const beamB = interpolate(frame, [260, 500], [0, 1], clamp);
  const beamC = interpolate(frame, [620, 900], [0, 1], clamp);
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id="cyanBeam" x1="0" x2="1">
          <stop offset="0" stopColor="rgba(32,215,232,0)" />
          <stop offset="0.5" stopColor="rgba(32,215,232,0.86)" />
          <stop offset="1" stopColor="rgba(32,215,232,0)" />
        </linearGradient>
        <linearGradient id="goldBeam" x1="0" x2="1">
          <stop offset="0" stopColor="rgba(215,168,74,0)" />
          <stop offset="0.5" stopColor="rgba(215,168,74,0.9)" />
          <stop offset="1" stopColor="rgba(215,168,74,0)" />
        </linearGradient>
      </defs>
      <path d="M 565 520 C 640 420 720 415 815 505" stroke="url(#cyanBeam)" strokeWidth="5" fill="none" opacity={beamA} strokeDasharray="18 20" strokeDashoffset={-frame * 2} />
      <path d="M 960 500 C 1110 390 1220 390 1370 505" stroke="url(#cyanBeam)" strokeWidth="5" fill="none" opacity={beamB} strokeDasharray="18 20" strokeDashoffset={-frame * 2.2} />
      <path d="M 1380 570 C 1510 600 1550 680 1650 720" stroke="url(#goldBeam)" strokeWidth="5" fill="none" opacity={beamC} strokeDasharray="20 18" strokeDashoffset={-frame * 2.4} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const t = ((frame * 0.012 + i / 6) % 1);
        const opacity = interpolate(t, [0, 0.2, 0.8, 1], [0, 1, 1, 0], clamp);
        return <circle key={i} cx={620 + t * 760} cy={500 + Math.sin(t * Math.PI * 2) * 70} r="5" fill={i % 2 ? gold : cyan} opacity={opacity * beamB} />;
      })}
    </svg>
  );
};

const StageTimeline = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute',
      left: 94,
      right: 94,
      bottom: 68,
      height: 86,
      zIndex: 30,
      borderTop: '1px solid rgba(127,229,255,0.24)',
      borderBottom: '1px solid rgba(215,168,74,0.28)',
      background: 'linear-gradient(90deg, rgba(4,7,13,0.05), rgba(4,7,13,0.72), rgba(4,7,13,0.05))',
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 14,
      padding: '12px 22px',
    }}>
      {stages.map((stage) => {
        const active = frame >= stage.start && frame < stage.end;
        const seen = frame >= stage.start;
        return (
          <div key={stage.label} style={{
            height: '100%',
            border: `1px solid ${active ? 'rgba(255,230,173,0.62)' : 'rgba(127,229,255,0.16)'}`,
            borderRadius: 10,
            padding: '10px 12px',
            opacity: seen ? 1 : 0.32,
            background: active ? 'linear-gradient(135deg, rgba(217,45,32,0.32), rgba(32,215,232,0.16))' : 'rgba(255,255,255,0.035)',
            boxShadow: active ? '0 0 28px rgba(215,168,74,0.2)' : 'none',
          }}>
            <div style={{ color: active ? gold : 'rgba(242,232,213,0.72)', fontSize: 16, fontWeight: 900, fontFamily: 'Consolas, monospace' }}>{stage.label}</div>
            <div style={{ color: cream, marginTop: 5, fontSize: 19, fontWeight: 750 }}>{stage.cn}</div>
          </div>
        );
      })}
    </div>
  );
};

const EventRouter = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [875, 940, 1260, 1310], [0, 1, 1, 0], clamp);
  const labels = ['挥手切换', '扇面遮脸', '举手吐火'];
  return (
    <div style={{
      position: 'absolute',
      left: 600,
      top: 760,
      width: 760,
      height: 138,
      zIndex: 28,
      opacity,
      border: '1px solid rgba(255,230,173,0.34)',
      borderRadius: 18,
      background: 'linear-gradient(135deg, rgba(8,14,24,0.86), rgba(52,12,8,0.64))',
      boxShadow: '0 28px 70px rgba(0,0,0,0.42), inset 0 0 36px rgba(215,168,74,0.09)',
      display: 'grid',
      gridTemplateColumns: '230px 1fr',
      alignItems: 'center',
      padding: '20px 28px',
    }}>
      <div>
        <div style={{ color: gold, fontSize: 22, fontWeight: 900 }}>事件路由器</div>
        <div style={{ color: 'rgba(242,232,213,0.68)', fontSize: 17, marginTop: 8 }}>空间交集 + 时序轨迹</div>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {labels.map((label, index) => {
          const active = frame > 950 + index * 45;
          return (
            <div key={label} style={{
              flex: 1,
              height: 72,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 12,
              border: `1px solid ${active ? 'rgba(32,215,232,0.62)' : 'rgba(255,255,255,0.12)'}`,
              color: active ? cream : 'rgba(242,232,213,0.54)',
              background: active ? 'rgba(32,215,232,0.14)' : 'rgba(255,255,255,0.04)',
              fontSize: 21,
              fontWeight: 800,
              boxShadow: active ? `0 0 24px rgba(32,215,232,0.18)` : 'none',
            }}>
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CaptionBand = () => {
  const frame = useCurrentFrame();
  const captions = [
    { s: 40, e: 220, text: '浏览器摄像头采集连续 RGB 视频帧，作为实时视觉输入。' },
    { s: 220, e: 420, text: 'Face Mesh 先借助轻量人脸检测器锁定 ROI，让后续追踪更稳定。' },
    { s: 420, e: 720, text: '随后输出 468 个三维稠密关键点，覆盖面部轮廓、五官位置与相对深度。' },
    { s: 720, e: 960, text: 'MediaPipe Hands 同步识别 21 个手部三维关键点，捕捉挥手、遮脸、举手动作。' },
    { s: 960, e: 1290, text: '人脸姿态与手部轨迹共同进入事件判断层，驱动变脸、舞扇和吐火交互。' },
  ];
  const current = captions.find((item) => frame >= item.s && frame < item.e) || captions[captions.length - 1];
  const opacity = interpolate(frame, [current.s, current.s + 16, current.e - 16, current.e], [0, 1, 1, 0], clamp);
  return (
    <div style={{
      position: 'absolute',
      left: 270,
      right: 270,
      bottom: 180,
      zIndex: 32,
      opacity,
      color: cream,
      textAlign: 'center',
      fontSize: 34,
      lineHeight: 1.45,
      fontWeight: 760,
      textShadow: '0 4px 20px rgba(0,0,0,0.9)',
    }}>
      {current.text}
    </div>
  );
};

const FloatingMask = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [1040, 1120, 1280, 1320], [0, 0.68, 0.68, 0], clamp);
  return (
    <Img
      src={staticFile('mask-guanyu.png')}
      style={{
        position: 'absolute',
        right: 92,
        top: 70,
        width: 215,
        opacity,
        zIndex: 18,
        filter: 'drop-shadow(0 0 24px rgba(215,168,74,0.42))',
        transform: `rotate(${Math.sin(frame / 42) * 4}deg) translateY(${Math.sin(frame / 31) * 10}px)`,
      }}
    />
  );
};

export const RealtimeInputRoute = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const introOpacity = interpolate(frame, [0, 30, 150, 210], [0, 1, 1, 0], clamp);
  const audioVolume = interpolate(frame, [0, 45, 1240, 1320], [0, 0.22, 0.22, 0], clamp);

  return (
    <AbsoluteFill style={{ fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif', background: '#05070c' }}>
      <Audio src={staticFile('opera-background.mp3')} volume={audioVolume} startFrom={0} />
      <GridBackground />
      <Title />
      <FlowBeams />
      <CameraStream />
      <FaceRoi />
      <FaceMesh />
      <HandTracking />
      <EventRouter />
      <FloatingMask />
      <StageTimeline />
      <CaptionBand />
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        opacity: introOpacity,
        background: 'radial-gradient(circle at 50% 45%, rgba(32,215,232,0.16), rgba(5,7,12,0.92) 70%)',
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ textAlign: 'center', transform: `scale(${interpolate(frame, [0, 120], [0.96, 1.02], clamp)})` }}>
          <div style={{ color: cyan, fontSize: 30, fontWeight: 900, letterSpacing: 0 }}>CORE TECH ROUTE 01</div>
          <div style={{ marginTop: 18, color: cream, fontFamily: '"Source Han Serif SC", SimSun, serif', fontSize: 72, fontWeight: 900 }}>
            实时输入与追踪
          </div>
          <div style={{ marginTop: 22, color: 'rgba(242,232,213,0.76)', fontSize: 30 }}>
            RGB 视频帧 → Face Mesh → 468 点人脸关键点 + Hands 21 点手势
          </div>
        </div>
      </div>
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: interpolate(frame, [0, 40, 1270, 1320], [-100, 0, 0, -100], clamp),
        height: 6,
        zIndex: 50,
        background: `linear-gradient(90deg, transparent, ${cyan}, ${gold}, transparent)`,
        opacity: 0.82,
      }} />
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: interpolate(frame, [0, 40, 1270, 1320], [-100, 0, 0, -100], clamp),
        height: 6,
        zIndex: 50,
        background: `linear-gradient(90deg, transparent, ${red}, ${gold}, transparent)`,
        opacity: 0.72,
      }} />
    </AbsoluteFill>
  );
};
