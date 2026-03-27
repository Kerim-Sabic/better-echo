import React, { useCallback, useEffect, useMemo, useState } from 'react';
import HoralixAiResultsPanelLayout from '../layouts/HoralixAiResultsPanelLayout';
import { HoralixAiResultsPayload } from '../horalixAiResults.types';

const CHANNEL_DEFAULT = 'horalix-ai';
const MESSAGE_VERSION = 1;
const PANEL_READY_TYPE = 'horalix:panel-ready';
const AI_RESULTS_TYPE = 'horalix:ai-results';
const PANECHO_OVERRIDE_SAVE_TYPE = 'horalix:panecho-override-save';
const PANECHO_OVERRIDE_CLEAR_TYPE = 'horalix:panecho-override-clear';
const LLM_REPORT_REGENERATE_TYPE = 'horalix:llm-report-regenerate';

type PanechoOverridePayload = {
  value?: number;
  label?: string;
};

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

function sendParentMessage(
  channel: string,
  allowedParentOrigins: string[],
  type: string,
  payload?: Record<string, unknown>
) {
  if (!window.parent || window.parent === window) {
    return;
  }

  const message = {
    channel,
    type,
    version: MESSAGE_VERSION,
    sentAt: new Date().toISOString(),
    ...(payload ? { payload } : {}),
  };

  if (!allowedParentOrigins.length) {
    window.parent.postMessage(message, '*');
    return;
  }

  allowedParentOrigins.forEach(origin => {
    window.parent.postMessage(message, origin);
  });
}

function sendPanelReady(channel: string, allowedParentOrigins: string[]) {
  sendParentMessage(channel, allowedParentOrigins, PANEL_READY_TYPE);
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

  const onRequestSavePanechoOverride = useCallback(
    (key: string, override: PanechoOverridePayload) => {
      const studyUid =
        typeof payload?.studyUid === 'string' ? payload.studyUid.trim() : '';
      const measurementKey = typeof key === 'string' ? key.trim() : '';

      if (!studyUid || !measurementKey || !isObject(override)) {
        return;
      }

      sendParentMessage(
        bridgeConfig.channel,
        bridgeConfig.allowedParentOrigins,
        PANECHO_OVERRIDE_SAVE_TYPE,
        {
          studyUid,
          key: measurementKey,
          override,
        }
      );
    },
    [bridgeConfig, payload?.studyUid]
  );

  const onRequestClearPanechoOverride = useCallback(
    (key: string) => {
      const studyUid =
        typeof payload?.studyUid === 'string' ? payload.studyUid.trim() : '';
      const measurementKey = typeof key === 'string' ? key.trim() : '';

      if (!studyUid || !measurementKey) {
        return;
      }

      sendParentMessage(
        bridgeConfig.channel,
        bridgeConfig.allowedParentOrigins,
        PANECHO_OVERRIDE_CLEAR_TYPE,
        {
          studyUid,
          key: measurementKey,
        }
      );
    },
    [bridgeConfig, payload?.studyUid]
  );

  const onRequestRegenerateLlmReport = useCallback(() => {
    const studyUid =
      typeof payload?.studyUid === 'string' ? payload.studyUid.trim() : '';

    if (!studyUid) {
      return;
    }

    sendParentMessage(
      bridgeConfig.channel,
      bridgeConfig.allowedParentOrigins,
      LLM_REPORT_REGENERATE_TYPE,
      {
        studyUid,
      }
    );
  }, [bridgeConfig, payload?.studyUid]);

  return (
    <HoralixAiResultsPanelLayout
      payload={payload}
      onRequestSavePanechoOverride={onRequestSavePanechoOverride}
      onRequestClearPanechoOverride={onRequestClearPanechoOverride}
      onRequestRegenerateLlmReport={onRequestRegenerateLlmReport}
    />
  );
}
