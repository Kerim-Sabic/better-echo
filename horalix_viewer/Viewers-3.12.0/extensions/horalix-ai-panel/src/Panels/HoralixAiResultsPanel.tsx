import React, { useEffect, useMemo, useState } from 'react';

const CHANNEL_DEFAULT = 'horalix-ai';
const MESSAGE_VERSION = 1;
const PANEL_READY_TYPE = 'horalix:panel-ready';
const AI_RESULTS_TYPE = 'horalix:ai-results';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function resolveBridgeConfig(appConfig) {
  const bridge = appConfig?.horalixAiBridge;
  const allowedParentOrigins = toArray(bridge?.allowedParentOrigins).filter(
    origin => typeof origin === 'string' && origin.length
  );
  const channel =
    typeof bridge?.channel === 'string' && bridge.channel.length ? bridge.channel : CHANNEL_DEFAULT;

  return {
    channel,
    allowedParentOrigins,
  };
}

function sendPanelReady({ channel, allowedParentOrigins }) {
  if (!window.parent || window.parent === window) {
    return;
  }

  const message = {
    channel,
    type: PANEL_READY_TYPE,
    version: MESSAGE_VERSION,
    sentAt: new Date().toISOString(),
  };

  if (allowedParentOrigins.length === 0) {
    window.parent.postMessage(message, '*');
    return;
  }

  allowedParentOrigins.forEach(origin => {
    window.parent.postMessage(message, origin);
  });
}

function isAllowedOrigin(origin, allowedParentOrigins) {
  if (!origin || origin === 'null') {
    return false;
  }

  if (allowedParentOrigins.length === 0) {
    return true;
  }

  return allowedParentOrigins.includes(origin);
}

function statusClass(state) {
  if (state === 'ready') {
    return 'bg-green-900 text-green-200';
  }

  if (state === 'error') {
    return 'bg-red-900 text-red-200';
  }

  if (state === 'loading' || state === 'pending') {
    return 'bg-yellow-900 text-yellow-200';
  }

  return 'bg-primary-dark text-primary-light';
}

function KeyValue({ label, value }) {
  return (
    <div className="border-secondary-dark bg-primary-dark/20 rounded px-3 py-2 text-xs">
      <div className="text-muted-foreground mb-1 uppercase">{label}</div>
      <div className="break-all text-white">{value ?? '-'}</div>
    </div>
  );
}

function JsonBlock({ title, value, open = false }) {
  return (
    <details className="border-secondary-dark bg-primary-dark/20 rounded p-2 text-xs" open={open}>
      <summary className="cursor-pointer text-white">{title}</summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-blue-100">
        {safeJson(value)}
      </pre>
    </details>
  );
}

export default function HoralixAiResultsPanel({ appConfig }) {
  const [payload, setPayload] = useState(null);

  const bridgeConfig = useMemo(() => resolveBridgeConfig(appConfig), [appConfig]);

  useEffect(() => {
    sendPanelReady(bridgeConfig);

    const onMessage = event => {
      if (event.source !== window.parent) {
        return;
      }

      if (!isAllowedOrigin(event.origin, bridgeConfig.allowedParentOrigins)) {
        return;
      }

      const data = event.data;
      if (!isObject(data)) {
        return;
      }

      if (data.channel !== bridgeConfig.channel) {
        return;
      }

      if (data.type !== AI_RESULTS_TYPE || data.version !== MESSAGE_VERSION) {
        return;
      }

      if (!isObject(data.payload)) {
        return;
      }

      setPayload(data.payload);
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [bridgeConfig]);

  if (!payload) {
    return (
      <div className="flex h-full flex-col gap-3 p-3 text-sm text-white">
        <div className="text-base font-semibold">AI Results</div>
        <div className="border-secondary-dark bg-primary-dark/20 rounded p-3 text-sm text-blue-100">
          Waiting for AI payload from parent application.
        </div>
      </div>
    );
  }

  const aiMeasurements = isObject(payload.aiMeasurements) ? payload.aiMeasurements : null;
  const aiVideoMeasurements = isObject(payload.aiVideoMeasurements)
    ? payload.aiVideoMeasurements
    : payload.aiVideoMeasurements;

  const state = payload.state || 'unknown';
  const totalMeasurements =
    aiMeasurements && typeof aiMeasurements.totalMeasurements === 'number'
      ? aiMeasurements.totalMeasurements
      : null;

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-sm text-white">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">AI Results</div>
        <span className={`rounded px-2 py-1 text-xs font-medium ${statusClass(state)}`}>{state}</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <KeyValue label="Study UID" value={payload.studyUID} />
        <KeyValue label="Patient Name" value={payload.patientName} />
        <KeyValue label="Patient Sex" value={payload.patientSex} />
        <KeyValue label="PanEcho State" value={payload.panEchoEchoprimeState} />
        <KeyValue label="Dynamic State" value={payload.dynamicMeasurementsState} />
        <KeyValue label="Total Measurements" value={totalMeasurements} />
        <KeyValue label="Overrides" value={payload.hasOverrides ? 'Yes' : 'No'} />
        <KeyValue label="Latest Override At" value={payload.latestOverrideAt} />
      </div>

      {state !== 'ready' && (
        <div className="border-secondary-dark bg-primary-dark/20 rounded p-3 text-xs text-blue-100">
          Measurements are not ready yet. The panel updates automatically when new payload arrives.
        </div>
      )}

      <JsonBlock title="AI Measurements Payload" value={aiMeasurements ?? payload.aiMeasurements} open />
      <JsonBlock title="AI Video Measurements Payload" value={aiVideoMeasurements} />
    </div>
  );
}
