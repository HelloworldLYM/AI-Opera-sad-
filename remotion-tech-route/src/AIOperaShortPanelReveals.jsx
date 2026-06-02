import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

export const AI_OPERA_SHORT_PANEL_DURATION = 120;

const SOURCE_W = 1672;
const SOURCE_H = 941;
const OUT_W = 1920;
const OUT_H = 1080;
const sx = OUT_W / SOURCE_W;
const sy = OUT_H / SOURCE_H;

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

const imageMap = {
  visual: 'short-panel-reveals/01-visual-trigger.png',
  modeling: 'short-panel-reveals/02-3d-modeling.png',
};

const layouts = {
  visual: [
    {x: 32, y: 190, w: 314, h: 527, start: 4, duration: 14},
    {x: 380, y: 190, w: 301, h: 527, start: 16, duration: 14},
    {x: 704, y: 190, w: 254, h: 527, start: 28, duration: 14},
    {x: 984, y: 190, w: 298, h: 527, start: 40, duration: 14},
    {x: 1306, y: 186, w: 336, h: 540, start: 52, duration: 14},
    {x: 64, y: 755, w: 1501, h: 139, start: 68, duration: 16},
  ],
  modeling: [
    {x: 32, y: 157, w: 275, h: 455, start: 4, duration: 14},
    {x: 319, y: 157, w: 289, h: 455, start: 16, duration: 14},
    {x: 619, y: 157, w: 338, h: 455, start: 28, duration: 14},
    {x: 974, y: 157, w: 309, h: 455, start: 40, duration: 14},
    {x: 1304, y: 157, w: 337, h: 455, start: 52, duration: 14},
    {
      x: 470,
      y: 548,
      w: 836,
      h: 242,
      start: 66,
      duration: 14,
      revealMode: 'fade',
      shape: [
        [2, 45],
        [8, 36],
        [34, 36],
        [42, 28],
        [48, 14],
        [56, 16],
        [59, 35],
        [66, 47],
        [84, 47],
        [92, 53],
        [98, 66],
        [98, 86],
        [94, 98],
        [61, 98],
        [55, 94],
        [47, 96],
        [39, 100],
        [14, 98],
        [5, 90],
        [1, 76],
      ],
    },
    {x: 123, y: 789, w: 1426, h: 132, start: 78, duration: 16},
  ],
};

const toOut = (rect) => ({
  left: rect.x * sx,
  top: rect.y * sy,
  width: rect.w * sx,
  height: rect.h * sy,
});

const polygonClip = (rect) => {
  if (!rect.shape) {
    return undefined;
  }

  return `polygon(${rect.shape.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
};

const FullImage = ({src, opacity = 1, brightness = 1}) => (
  <Img
    src={src}
    style={{
      position: 'absolute',
      inset: 0,
      width: OUT_W,
      height: OUT_H,
      objectFit: 'fill',
      opacity,
      filter: `brightness(${brightness}) saturate(1.04) contrast(1.03)`,
    }}
  />
);

const Cover = ({rect, frame}) => {
  const r = toOut(rect);
  const clipPath = polygonClip(rect);
  const opacity = interpolate(
    frame,
    [rect.start - 2, rect.start + rect.duration],
    [0.9, 0],
    {...clamp, easing: easeOut},
  );

  return (
    <div
      style={{
        position: 'absolute',
        ...r,
        borderRadius: 7,
        clipPath,
        background:
          'linear-gradient(90deg, rgba(1,6,11,0.96), rgba(3,14,21,0.9))',
        boxShadow: 'inset 0 0 36px rgba(32, 215, 232, 0.08)',
        opacity,
      }}
    />
  );
};

const RevealBlock = ({rect, frame, src}) => {
  const r = toOut(rect);
  const clipPath = polygonClip(rect);
  const progress = interpolate(
    frame,
    [rect.start, rect.start + rect.duration],
    [0, 1],
    {...clamp, easing: easeOut},
  );
  const revealClip =
    rect.revealMode === 'fade'
      ? 'inset(0 0 0 0)'
      : `inset(0 ${100 - progress * 100}% 0 0)`;
  const opacity = interpolate(
    frame,
    [rect.start, rect.start + Math.max(5, rect.duration * 0.5)],
    [0, 1],
    clamp,
  );
  const glow = interpolate(
    frame,
    [rect.start, rect.start + rect.duration, rect.start + rect.duration + 14],
    [0, 1, 0.32],
    clamp,
  );

  return (
    <div
      style={{
        position: 'absolute',
        ...r,
        overflow: 'hidden',
        borderRadius: 7,
        clipPath,
        opacity,
        filter: `drop-shadow(0 0 ${14 + glow * 14}px rgba(32, 215, 232, ${0.22 + glow * 0.25}))`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          clipPath: revealClip,
        }}
      >
        <Img
          src={src}
          style={{
            position: 'absolute',
            left: -r.left,
            top: -r.top,
            width: OUT_W,
            height: OUT_H,
            objectFit: 'fill',
            filter: 'brightness(1.12) saturate(1.06) contrast(1.04)',
          }}
        />
      </div>
      {!rect.shape && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 7,
            border: '1px solid rgba(42, 218, 255, 0.46)',
            boxShadow:
              'inset 0 0 22px rgba(32, 215, 232, 0.18), 0 0 24px rgba(215, 168, 74, 0.12)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};

const Particles = () => {
  const frame = useCurrentFrame();
  const dots = Array.from({length: 36}, (_, i) => {
    const x = (i * 137) % OUT_W;
    const baseY = 170 + ((i * 89) % 770);
    const drift = ((frame * (0.15 + (i % 4) * 0.04) + i * 17) % 70) - 35;
    const size = 1 + (i % 3) * 0.7;
    const alpha = 0.12 + (i % 5) * 0.035;

    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: baseY - drift,
          width: size,
          height: size,
          borderRadius: '50%',
          background: i % 4 === 0 ? '#d7a84a' : '#20d7e8',
          boxShadow: `0 0 ${8 + size * 3}px currentColor`,
          opacity: alpha,
        }}
      />
    );
  });

  return <>{dots}</>;
};

const Atmosphere = () => (
  <>
    <Particles />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(circle at center, rgba(32,215,232,0.08), transparent 38%), radial-gradient(circle at 50% 100%, rgba(215,168,74,0.12), transparent 38%)',
        mixBlendMode: 'screen',
        opacity: 0.62,
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(circle at center, transparent 48%, rgba(0,0,0,0.22) 78%, rgba(0,0,0,0.46) 100%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.08,
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)',
        backgroundSize: '100% 4px',
        mixBlendMode: 'screen',
      }}
    />
  </>
);

export const AIOperaShortPanelReveal = ({variant = 'visual'}) => {
  const frame = useCurrentFrame();
  const src = staticFile(imageMap[variant]);
  const blocks = layouts[variant];
  const entry = interpolate(frame, [0, 18], [1.018, 1], {
    ...clamp,
    easing: easeOut,
  });
  const fullBrightness = interpolate(frame, [0, 14], [0.78, 0.96], clamp);

  return (
    <AbsoluteFill style={{backgroundColor: '#020508'}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${entry})`,
          transformOrigin: 'center center',
        }}
      >
        <FullImage src={src} brightness={fullBrightness} />
        {blocks.map((rect, index) => (
          <Cover key={`cover-${index}`} rect={rect} frame={frame} />
        ))}
        {blocks.map((rect, index) => (
          <RevealBlock
            key={`reveal-${index}`}
            rect={rect}
            frame={frame}
            src={src}
          />
        ))}
      </div>
      <Atmosphere />
    </AbsoluteFill>
  );
};

export const AIOperaVisualTriggerPanels = () => (
  <AIOperaShortPanelReveal variant="visual" />
);

export const AIOperaModelingPanels = () => (
  <AIOperaShortPanelReveal variant="modeling" />
);
