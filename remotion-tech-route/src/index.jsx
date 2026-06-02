import React from 'react';
import { registerRoot } from 'remotion';
import { Composition } from 'remotion';
import { RealtimeInputRoute } from './RealtimeInputRoute.jsx';
import { AIOperaPromo, AI_OPERA_PROMO_DURATION } from './AIOperaPromo.jsx';
import {
  AIOperaElementReveal,
  AI_OPERA_ELEMENT_REVEAL_DURATION,
} from './AIOperaElementReveal.jsx';
import {
  AIOperaHyperframes,
  AI_OPERA_HYPERFRAMES_DURATION,
} from './AIOperaHyperframes.jsx';
import {
  AIOperaModelingPanels,
  AIOperaVisualTriggerPanels,
  AI_OPERA_SHORT_PANEL_DURATION,
} from './AIOperaShortPanelReveals.jsx';
import {
  AIOperaVenueSequence,
  AI_OPERA_VENUE_SEQUENCE_DURATION,
} from './AIOperaVenueSequence.jsx';

const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="RealtimeInputRoute"
        component={RealtimeInputRoute}
        durationInFrames={1320}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AIOperaPromo"
        component={AIOperaPromo}
        durationInFrames={AI_OPERA_PROMO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AIOperaElementReveal"
        component={AIOperaElementReveal}
        durationInFrames={AI_OPERA_ELEMENT_REVEAL_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AIOperaHyperframes"
        component={AIOperaHyperframes}
        durationInFrames={AI_OPERA_HYPERFRAMES_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AIOperaVisualTriggerPanels"
        component={AIOperaVisualTriggerPanels}
        durationInFrames={AI_OPERA_SHORT_PANEL_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AIOperaModelingPanels"
        component={AIOperaModelingPanels}
        durationInFrames={AI_OPERA_SHORT_PANEL_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AIOperaVenueSequence"
        component={AIOperaVenueSequence}
        durationInFrames={AI_OPERA_VENUE_SEQUENCE_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);
