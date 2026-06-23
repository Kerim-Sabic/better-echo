import React, { useCallback, useEffect, useMemo, useState } from 'react';
import HoralixAiResultsPanelLayout from '../layouts/HoralixAiResultsPanelLayout';
import {
  HoralixAiOverlayInstanceSummary,
  HoralixAiResultsPayload,
} from '../horalixAiResults.types';

const CHANNEL_DEFAULT = 'horalix-ai';
const MESSAGE_VERSION = 1;
const PANEL_READY_TYPE = 'horalix:panel-ready';
const AI_RESULTS_TYPE = 'horalix:ai-results';
const STUDY_ANALYSIS_OVERRIDE_SAVE_TYPE =
  'horalix:study-analysis-override-save';
const STUDY_ANALYSIS_OVERRIDE_CLEAR_TYPE =
  'horalix:study-analysis-override-clear';
const LLM_REPORT_REGENERATE_TYPE = 'horalix:llm-report-regenerate';
const OVERLAY_INSTANCE_SUMMARIES_EVENT = 'horalix:ai-overlay-instances';
type StudyAnalysisOverridePayload = {
  value?: number;
  label?: string;
};

type HoralixOverlayWindow = Window & {
  __HORALIX_AI_OVERLAY_INSTANCE_SUMMARIES__?: HoralixAiOverlayInstanceSummary[];
};

type Props = {
  appConfig?: {
    horalixAiBridge?: {
      channel?: string;
      allowedParentOrigins?: string[];
    };
  };
  servicesManager?: any;
  commandsManager?: any;
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

function publishOverlayInstanceSummaries(payload: HoralixAiResultsPayload | null) {
  const summaries = Array.isArray(payload?.aiOverlayInstances)
    ? payload.aiOverlayInstances
    : [];
  (window as HoralixOverlayWindow).__HORALIX_AI_OVERLAY_INSTANCE_SUMMARIES__ =
    summaries;
  window.dispatchEvent(
    new CustomEvent(OVERLAY_INSTANCE_SUMMARIES_EVENT, { detail: summaries })
  );
}

export default function HoralixAiResultsPanelBridge({
  appConfig,
  servicesManager,
  commandsManager,
}: Props) {
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

  useEffect(() => {
    publishOverlayInstanceSummaries(payload);
  }, [payload]);

  const onRequestSaveStudyAnalysisOverride = useCallback(
    (key: string, override: StudyAnalysisOverridePayload) => {
      const studyUid =
        typeof payload?.studyUid === 'string' ? payload.studyUid.trim() : '';
      const measurementKey = typeof key === 'string' ? key.trim() : '';

      if (!studyUid || !measurementKey || !isObject(override)) {
        return;
      }

      sendParentMessage(
        bridgeConfig.channel,
        bridgeConfig.allowedParentOrigins,
        STUDY_ANALYSIS_OVERRIDE_SAVE_TYPE,
        {
          studyUid,
          key: measurementKey,
          override,
        }
      );
    },
    [bridgeConfig, payload?.studyUid]
  );

  const onRequestClearStudyAnalysisOverride = useCallback(
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
        STUDY_ANALYSIS_OVERRIDE_CLEAR_TYPE,
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
      servicesManager={servicesManager}
      commandsManager={commandsManager}
      onRequestSaveStudyAnalysisOverride={onRequestSaveStudyAnalysisOverride}
      onRequestClearStudyAnalysisOverride={onRequestClearStudyAnalysisOverride}
      onRequestRegenerateLlmReport={onRequestRegenerateLlmReport}
    />
  );
}
