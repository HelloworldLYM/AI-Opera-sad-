import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

export const AI_OPERA_VENUE_SEQUENCE_DURATION = 360;

const SOURCE_W = 1672;
const SOURCE_H = 941;
const OUT_W = 1920;
const OUT_H = 1080;
const sx = OUT_W / SOURCE_W;
const sy = OUT_H / SOURCE_H;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

const images = [
  'venue-sequence/01.png',
  'venue-sequence/02.png',
  'venue-sequence/03.png',
];

const sceneLength = 120;

const scenes = [
  [
    {x: 58, y: 184, w: 815, h: 488, start: 6, duration: 12},
    {
      x: 858,
      y: 128,
      w: 455,
      h: 662,
      start: 18,
      duration: 12,
      shape: [
        [0, 0],
        [100, 0],
        [100, 100],
        [18, 100],
        [18, 85],
        [0, 85],
      ],
    },
    {x: 1350, y: 132, w: 252, h: 113, start: 30, duration: 10},
    {x: 1351, y: 267, w: 252, h: 110, start: 39, duration: 10},
    {x: 1350, y: 402, w: 252, h: 111, start: 48, duration: 10},
    {x: 1350, y: 536, w: 252, h: 111, start: 57, duration: 10},
    {x: 1350, y: 668, w: 252, h: 111, start: 66, duration: 10},
    {x: 50, y: 690, w: 878, h: 138, start: 76, duration: 12},
    {x: 210, y: 838, w: 1228, h: 56, start: 88, duration: 12},
  ],
  [
    {x: 36, y: 177, w: 517, h: 492, start: 6, duration: 12},
    {x: 578, y: 181, w: 238, h: 498, start: 18, duration: 11},
    {x: 840, y: 181, w: 256, h: 498, start: 29, duration: 11},
    {x: 1117, y: 181, w: 236, h: 498, start: 40, duration: 11},
    {x: 1371, y: 181, w: 239, h: 498, start: 51, duration: 11},
    {x: 720, y: 695, w: 366, h: 88, start: 63, duration: 10},
    {x: 1190, y: 695, w: 356, h: 88, start: 72, duration: 10},
    {x: 296, y: 788, w: 1116, h: 47, start: 82, duration: 11},
    {x: 255, y: 839, w: 1192, h: 78, start: 92, duration: 11},
  ],
  [
    {x: 34, y: 164, w: 667, h: 415, start: 6, duration: 12},
    {x: 722, y: 142, w: 583, h: 458, start: 18, duration: 12},
    {x: 1304, y: 160, w: 284, h: 570, start: 30, duration: 12},
    {x: 35, y: 604, w: 1145, h: 98, start: 43, duration: 12},
    {x: 146, y: 715, w: 1191, h: 45, start: 56, duration: 10},
    {x: 203, y: 779, w: 1238, h: 104, start: 68, duration: 12},
  ],
];

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

const SceneImage = ({src, brightness = 1, opacity = 1}) => (
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
  const shapeClip = polygonClip(rect);
  const opacity = interpolate(
    frame,
    [rect.start - 2, rect.start + rect.duration],
    [0.92, 0],
    {...clamp, easing: easeOut},
  );

  return (
    <div
      style={{
        position: 'absolute',
        ...r,
        borderRadius: 7,
        background:
          'linear-gradient(90deg, rgba(1,6,11,0.96), rgba(3,14,21,0.9))',
        boxShadow: 'inset 0 0 34px rgba(32,215,232,0.08)',
        clipPath: shapeClip,
        opacity,
      }}
    />
  );
};

const Reveal = ({rect, frame, src}) => {
  const r = toOut(rect);
  const shapeClip = polygonClip(rect);
  const progress = interpolate(
    frame,
    [rect.start, rect.start + rect.duration],
    [0, 1],
    {...clamp, easing: easeOut},
  );
  const opacity = interpolate(
    frame,
    [rect.start, rect.start + 7],
    [0, 1],
    clamp,
  );
  const glow = interpolate(
    frame,
    [rect.start, rect.start + rect.duration, rect.start + rect.duration + 18],
    [0, 1, 0.25],
    clamp,
  );

  return (
    <div
      style={{
        position: 'absolute',
        ...r,
        overflow: 'hidden',
        borderRadius: 7,
        clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
        opacity,
        filter: `drop-shadow(0 0 ${12 + glow * 16}px rgba(32,215,232,${0.18 + glow * 0.28}))`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: shapeClip,
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 7,
            border: '1px solid rgba(42,218,255,0.42)',
            boxShadow:
              'inset 0 0 20px rgba(32,215,232,0.14), 0 0 22px rgba(215,168,74,0.1)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

const Atmosphere = ({frame}) => {
  const dots = Array.from({length: 30}, (_, i) => {
    const x = (i * 163) % OUT_W;
    const baseY = 130 + ((i * 101) % 820);
    const drift = ((frame * (0.13 + (i % 5) * 0.035) + i * 11) % 58) - 29;
    const size = 1 + (i % 3) * 0.55;
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
          boxShadow: `0 0 ${7 + size * 3}px currentColor`,
          opacity: 0.11 + (i % 5) * 0.03,
        }}
      />
    );
  });

  return (
    <>
      {dots}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at center, rgba(32,215,232,0.06), transparent 38%), radial-gradient(circle at 50% 100%, rgba(215,168,74,0.1), transparent 38%)',
          mixBlendMode: 'screen',
          opacity: 0.58,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.07,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)',
          backgroundSize: '100% 4px',
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at center, transparent 50%, rgba(0,0,0,0.24) 82%, rgba(0,0,0,0.48) 100%)',
        }}
      />
    </>
  );
};

const Page = ({index, frame}) => {
  const sceneFrame = frame - index * sceneLength;
  const src = staticFile(images[index]);
  const blocks = scenes[index];
  const opacity = interpolate(
    sceneFrame,
    [0, 8, sceneLength - 10, sceneLength],
    [0, 1, 1, index === images.length - 1 ? 1 : 0],
    clamp,
  );
  const scale = interpolate(sceneFrame, [0, 22], [1.018, 1], {
    ...clamp,
    easing: easeOut,
  });
  const brightness = interpolate(sceneFrame, [0, 18], [0.78, 0.96], clamp);

  if (sceneFrame < -10 || sceneFrame > sceneLength) {
    return null;
  }

  return (
    <AbsoluteFill style={{opacity}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <SceneImage src={src} brightness={brightness} />
        {blocks.map((rect, blockIndex) => (
          <Cover key={`cover-${blockIndex}`} rect={rect} frame={sceneFrame} />
        ))}
        {blocks.map((rect, blockIndex) => (
          <Reveal
            key={`reveal-${blockIndex}`}
            rect={rect}
            frame={sceneFrame}
            src={src}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const AIOperaVenueSequence = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{backgroundColor: '#020508'}}>
      {images.map((_, index) => (
        <Page key={index} index={index} frame={frame} />
      ))}
      <Atmosphere frame={frame} />
    </AbsoluteFill>
  );
};
