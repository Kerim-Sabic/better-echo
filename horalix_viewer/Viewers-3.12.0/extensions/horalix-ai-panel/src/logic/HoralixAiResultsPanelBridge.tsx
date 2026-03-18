import React, { useEffect, useMemo, useState } from 'react';
import HoralixAiResultsPanelLayout from '../layouts/HoralixAiResultsPanelLayout';
import { HoralixAiResultsPayload } from '../horalixAiResults.types';

const CHANNEL_DEFAULT = 'horalix-ai';
const MESSAGE_VERSION = 1;
const PANEL_READY_TYPE = 'horalix:panel-ready';
const AI_RESULTS_TYPE = 'horalix:ai-results';

type Props = {
  appConfig?: {
    horalixAiBridge?: {
      channel?: string;
      allowedParentOrigins?: string[];
    };
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveBridgeConfig(appConfig?: Props['appConfig']) {
  const bridge = appConfig?.horalixAiBridge;

  return {
    channel:
      typeof bridge?.channel === 'string' && bridge.channel.length
        ? bridge.channel
        : CHANNEL_DEFAULT,
    allowedParentOrigins: Array.isArray(bridge?.allowedParentOrigins)
      ? bridge.allowedParentOrigins.filter(
          origin => typeof origin === 'string' && origin.length > 0
        )
      : [],
  };
}

function isAllowedOrigin(origin: string, allowedParentOrigins: string[]) {
  if (!origin || origin === 'null') {
    return false;
  }

  if (!allowedParentOrigins.length) {
    return true;
  }

  return allowedParentOrigins.includes(origin);
}

function sendPanelReady(channel: string, allowedParentOrigins: string[]) {
  if (!window.parent || window.parent === window) {
    return;
  }

  const message = {
    channel,
    type: PANEL_READY_TYPE,
    version: MESSAGE_VERSION,
    sentAt: new Date().toISOString(),
  };

  if (!allowedParentOrigins.length) {
    window.parent.postMessage(message, '*');
    return;
  }

  allowedParentOrigins.forEach(origin => {
    window.parent.postMessage(message, origin);
  });
}

export default function HoralixAiResultsPanelBridge({ appConfig }: Props) {
  const [payload, setPayload] = useState<HoralixAiResultsPayload | null>(null);

  const bridgeConfig = useMemo(() => resolveBridgeConfig(appConfig), [appConfig]);

  useEffect(() => {
    sendPanelReady(bridgeConfig.channel, bridgeConfig.allowedParentOrigins);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) {
        return;
      }

      if (!isAllowedOrigin(event.origin, bridgeConfig.allowedParentOrigins)) {
        return;
      }

      const data = event.data;

      if (
        !isObject(data) ||
        data.channel !== bridgeConfig.channel ||
        data.type !== AI_RESULTS_TYPE ||
        data.version !== MESSAGE_VERSION ||
        !isObject(data.payload)
      ) {
        return;
      }

      setPayload(data.payload as HoralixAiResultsPayload);
    };

    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [bridgeConfig]);

  return <HoralixAiResultsPanelLayout payload={payload} />;
}
