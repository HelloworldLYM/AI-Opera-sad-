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

const WIDTH = 1920;
const HEIGHT = 1080;
const SOURCE_W = 1672;
const SOURCE_H = 941;
const SCALE = HEIGHT / SOURCE_H;
const FRAME_W = SOURCE_W * SCALE;
const FRAME_H = HEIGHT;
const FRAME_X = (WIDTH - FRAME_W) / 2;
const FRAME_Y = 0;
const FPS = 30;
const SCENE_SECONDS = 7;
const SCENE_FRAMES = SCENE_SECONDS * FPS;
const TRANSITION_FRAMES = 14;
export const AI_OPERA_ELEMENT_REVEAL_DURATION = SCENE_FRAMES * 5;

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeSoft = Easing.bezier(0.45, 0, 0.2, 1);

const slides = [
  {
    src: 'ai-opera-element-reveal/slide-01.png',
    mode: 'direct',
    regions: [
      { x: 552, y: 42, w: 590, h: 240, start: 6, move: 'down' },
      { x: 0, y: 70, w: 265, h: 820, start: 28, move: 'left' },
      { x: 1392, y: 70, w: 280, h: 820, start: 38, move: 'right' },
      { x: 690, y: 355, w: 350, h: 350, start: 54, move: 'up' },
      { x: 226, y: 310, w: 415, h: 475, start: 76, move: 'left' },
      { x: 452, y: 488, w: 300, h: 285, start: 92, move: 'up' },
      { x: 1025, y: 360, w: 435, h: 425, start: 108, move: 'right' },
      { x: 625, y: 680, w: 475, h: 245, start: 126, move: 'up' },
    ],
  },
  {
    src: 'ai-opera-element-reveal/slide-02.png',
    mode: 'maskedSequence',
    revealAreas: [
      { x: 54, y: 260, w: 350, h: 540, start: 34, move: 'left' },
      { x: 902, y: 260, w: 360, h: 540, start: 64, move: 'up' },
      { x: 1270, y: 260, w: 350, h: 540, start: 94, move: 'right' },
    ],
    regions: [
      { x: 360, y: 38, w: 940, h: 165, start: 6, move: 'down' },
      { x: 465, y: 220, w: 450, h: 560, start: 30, move: 'up' },
      { x: 78, y: 292, w: 325, h: 470, start: 54, move: 'left' },
      { x: 923, y: 292, w: 333, h: 470, start: 78, move: 'up' },
      { x: 1282, y: 292, w: 335, h: 470, start: 102, move: 'right' },
      { x: 0, y: 700, w: 1672, h: 240, start: 128, move: 'up' },
    ],
  },
  {
    src: 'ai-opera-element-reveal/slide-03.png',
    regions: [
      { x: 310, y: 28, w: 1050, h: 165, start: 6, move: 'down' },
      { x: 48, y: 178, w: 405, h: 625, start: 30, move: 'left' },
      { x: 465, y: 170, w: 475, h: 640, start: 55, move: 'up' },
      { x: 960, y: 205, w: 325, h: 565, start: 82, move: 'up' },
      { x: 1318, y: 170, w: 305, h: 640, start: 108, move: 'right' },
      { x: 180, y: 828, w: 1305, h: 86, start: 132, move: 'up' },
    ],
  },
  {
    src: 'ai-opera-element-reveal/slide-04.png',
    mode: 'ambient',
    regions: [
      { x: 40, y: 60, w: 545, h: 250, start: 6, move: 'left' },
      { x: 0, y: 315, w: 445, h: 575, start: 30, move: 'left' },
      { x: 575, y: 68, w: 590, h: 660, start: 55, move: 'up' },
      { x: 1115, y: 90, w: 470, h: 670, start: 82, move: 'right' },
      { x: 410, y: 705, w: 545, h: 130, start: 108, move: 'up' },
      { x: 1390, y: 680, w: 250, h: 245, start: 128, move: 'up' },
    ],
  },
  {
    src: 'ai-opera-element-reveal/slide-05.png',
    mode: 'maskedSequence',
    revealAreas: [
      { x: 138, y: 168, w: 350, h: 365, start: 24, move: 'left', shape: 'circle' },
      { x: 250, y: 520, w: 360, h: 360, start: 50, move: 'left', shape: 'circle' },
      { x: 625, y: 610, w: 430, h: 315, start: 76, move: 'up', shape: 'circle' },
      { x: 1110, y: 520, w: 360, h: 360, start: 102, move: 'right', shape: 'circle' },
      { x: 1254, y: 168, w: 350, h: 365, start: 128, move: 'right', shape: 'circle' },
      { x: 492, y: 230, w: 700, h: 450, start: 154, move: 'up' },
    ],
    regions: [
      { x: 340, y: 45, w: 990, h: 150, start: 6, move: 'down' },
      { x: 500, y: 230, w: 690, h: 400, start: 34, move: 'up' },
      { x: 150, y: 185, w: 390, h: 535, start: 58, move: 'left' },
      { x: 1098, y: 185, w: 450, h: 545, start: 82, move: 'right' },
      { x: 620, y: 610, w: 420, h: 260, start: 108, move: 'up' },
      { x: 0, y: 670, w: 1672, h: 270, start: 128, move: 'up' },
    ],
  },
];

const scaledRect = (rect) => ({
  left: FRAME_X + rect.x * SCALE,
  top: FRAME_Y + rect.y * SCALE,
  width: rect.w * SCALE,
  height: rect.h * SCALE,
});

const regionOffset = (move, amount) => {
  if (move === 'left') return `translateX(${-amount}px)`;
  if (move === 'right') return `translateX(${amount}px)`;
  if (move === 'down') return `translateY(${-amount}px)`;
  return `translateY(${amount}px)`;
};

const segmentProgress = (frame, start, duration) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

const SceneRegion = ({ src, rect, finalSolid }) => {
  const frame = useCurrentFrame();
  const enter = segmentProgress(frame, rect.start, 24);
  const scan = interpolate(frame, [rect.start, rect.start + 28], [0, 1], {
    ...clamp,
    easing: easeSoft,
  });
  const opacity = enter * (1 - finalSolid);
  const amount = interpolate(enter, [0, 1], [42, 0]);
  const scale = interpolate(enter, [0, 1], [1.018, 1]);
  const box = scaledRect(rect);

  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        overflow: 'hidden',
        opacity,
        transform: `${regionOffset(rect.move, amount)} scale(${scale})`,
        transformOrigin: 'center center',
        boxShadow: enter > 0 && enter < 1 ? '0 0 34px rgba(32,215,232,0.42)' : 'none',
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          left: -rect.x * SCALE,
          top: -rect.y * SCALE,
          width: FRAME_W,
          height: FRAME_H,
          objectFit: 'fill',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${scan * 110 - 10}%`,
          top: 0,
          width: '16%',
          height: '100%',
          opacity: enter * (1 - finalSolid),
          background:
            'linear-gradient(90deg, transparent 0%, rgba(32,215,232,0.34) 50%, transparent 100%)',
        }}
      />
    </div>
  );
};

const ExactFullImage = ({ src, opacity, scale = 1 }) => (
  <Img
    src={staticFile(src)}
    style={{
      position: 'absolute',
      left: FRAME_X,
      top: FRAME_Y,
      width: FRAME_W,
      height: FRAME_H,
      objectFit: 'fill',
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: 'center center',
    }}
  />
);

const TransitionVeil = ({ frame, index }) => {
  const transitionOut = index === slides.length - 1
    ? 0
    : interpolate(frame, [SCENE_FRAMES - TRANSITION_FRAMES, SCENE_FRAMES], [0, 1], clamp);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: transitionOut,
        background: '#04070d',
      }}
    />
  );
};

const DirectSlideScene = ({ slide, index }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 26], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#04070d', overflow: 'hidden' }}>
      <ExactFullImage src={slide.src} opacity={enter} />
      <TransitionVeil frame={frame} index={index} />
    </AbsoluteFill>
  );
};

const MaskedRevealArea = ({ src, area }) => {
  const frame = useCurrentFrame();
  const enter = segmentProgress(frame, area.start, area.duration || 24);
  const amount = interpolate(enter, [0, 1], [34, 0]);
  const scale = interpolate(enter, [0, 1], [0.975, 1]);
  const box = scaledRect(area);
  const isCircle = area.shape === 'circle';

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          borderRadius: isCircle ? '50%' : 10,
          background:
            'radial-gradient(circle at 50% 45%, rgba(5, 9, 15, 0.98), rgba(2, 4, 8, 0.98) 72%, rgba(2, 4, 8, 0.94))',
          boxShadow: isCircle
            ? '0 0 40px rgba(2, 4, 8, 0.86)'
            : '0 0 28px rgba(2, 4, 8, 0.82)',
          opacity: 1 - enter,
          zIndex: 6,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          overflow: 'hidden',
          borderRadius: isCircle ? '50%' : 10,
          opacity: enter,
          transform: `${regionOffset(area.move, amount)} scale(${scale})`,
          transformOrigin: 'center center',
          boxShadow: enter > 0 && enter < 1 ? '0 0 26px rgba(32,215,232,0.32)' : 'none',
          zIndex: 7,
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            position: 'absolute',
            left: -area.x * SCALE,
            top: -area.y * SCALE,
            width: FRAME_W,
            height: FRAME_H,
            objectFit: 'fill',
          }}
        />
      </div>
    </>
  );
};

const MaskedSequenceScene = ({ slide, index }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 20], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#04070d', overflow: 'hidden' }}>
      <ExactFullImage src={slide.src} opacity={enter} />
      {slide.revealAreas.map((area, areaIndex) => (
        <MaskedRevealArea key={`${slide.src}-${areaIndex}`} src={slide.src} area={area} />
      ))}
      <TransitionVeil frame={frame} index={index} />
    </AbsoluteFill>
  );
};

const AmbientSlideScene = ({ slide, index }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 24], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const breath = interpolate(Math.sin(frame / 28), [-1, 1], [0.04, 0.16]);
  const scale = interpolate(Math.sin(frame / 72), [-1, 1], [1, 1.006]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#04070d', overflow: 'hidden' }}>
      <ExactFullImage src={slide.src} opacity={enter} scale={scale} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: enter * breath,
          background:
            'radial-gradient(circle at 68% 18%, rgba(32,215,232,0.46), transparent 24%), radial-gradient(circle at 44% 62%, rgba(215,168,74,0.20), transparent 30%)',
          mixBlendMode: 'screen',
        }}
      />
      <TransitionVeil frame={frame} index={index} />
    </AbsoluteFill>
  );
};

const BlockRevealSlideScene = ({ slide, index }) => {
  const frame = useCurrentFrame();
  const finalSolid = interpolate(
    frame,
    [SCENE_FRAMES - 42, SCENE_FRAMES - 14],
    [0, 1],
    clamp
  );
  const ghostOpacity = interpolate(frame, [0, 24, SCENE_FRAMES - 42], [0, 0.16, 0.12], clamp);
  const baseScale = interpolate(frame, [0, SCENE_FRAMES], [1.012, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: '#04070d', overflow: 'hidden' }}>
      <ExactFullImage src={slide.src} opacity={ghostOpacity * (1 - finalSolid)} scale={baseScale} />
      {slide.regions.map((rect, regionIndex) => (
        <SceneRegion
          key={`${slide.src}-${regionIndex}`}
          src={slide.src}
          rect={rect}
          finalSolid={finalSolid}
        />
      ))}
      <ExactFullImage src={slide.src} opacity={finalSolid} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: (1 - finalSolid) * 0.28,
          background:
            'linear-gradient(180deg, rgba(4,7,13,0.15), transparent 26%, transparent 74%, rgba(4,7,13,0.18))',
        }}
      />
      <TransitionVeil frame={frame} index={index} />
    </AbsoluteFill>
  );
};

const SlideScene = ({ slide, index }) => {
  if (slide.mode === 'direct') {
    return <DirectSlideScene slide={slide} index={index} />;
  }

  if (slide.mode === 'maskedSequence') {
    return <MaskedSequenceScene slide={slide} index={index} />;
  }

  if (slide.mode === 'ambient') {
    return <AmbientSlideScene slide={slide} index={index} />;
  }

  return <BlockRevealSlideScene slide={slide} index={index} />;
};

export const AIOperaElementReveal = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = slides.length * SCENE_SECONDS * fps;

  return (
    <AbsoluteFill style={{ backgroundColor: '#04070d' }}>
      {slides.map((slide, index) => (
        <Sequence
          key={slide.src}
          from={index * SCENE_SECONDS * fps}
          durationInFrames={SCENE_SECONDS * fps}
          premountFor={fps}
        >
          <SlideScene slide={slide} index={index} />
        </Sequence>
      ))}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: interpolate(frame, [total - 20, total], [0, 0.08], clamp),
          background: '#04070d',
        }}
      />
    </AbsoluteFill>
  );
};
