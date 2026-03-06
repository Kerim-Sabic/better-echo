import React, { useEffect, useMemo, useState } from 'react';

const CHANNEL_DEFAULT = 'horalix-ai';
const MESSAGE_VERSION = 1;
const PANEL_READY_TYPE = 'horalix:panel-ready';
const AI_RESULTS_TYPE = 'horalix:ai-results';

const SECTION_LABELS = {
  Valves: 'VALVES',
  'LV Size & Function': 'LEFT VENTRICLE',
  Atria: 'ATRIA',
  'Right Heart': 'RIGHT VENTRICLE',
  Aorta: 'AORTA',
  'Devices / Procedures': 'DEVICES / PROCEDURES',
};

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    return 'bg-green-950/70 text-green-300 border border-green-500/40';
  }

  if (state === 'error') {
    return 'bg-red-950/70 text-red-300 border border-red-500/40';
  }

  if (state === 'loading' || state === 'pending') {
    return 'bg-yellow-950/70 text-yellow-300 border border-yellow-500/40';
  }

  return 'bg-[#182033] text-[#AFC1E6] border border-[#2A395A]';
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function toneClass(valueText) {
  const normalized = normalizeText(valueText);

  if (!normalized) {
    return 'bg-[#1B2438] text-[#9FB3D9] border border-[#2D3D63]';
  }

  if (
    normalized.includes('normal') ||
    normalized.includes('none') ||
    normalized.includes('absent') ||
    normalized.includes('not') ||
    normalized.includes('ready')
  ) {
    return 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40';
  }

  if (normalized.includes('mild')) {
    return 'bg-yellow-950/70 text-yellow-300 border border-yellow-500/40';
  }

  if (normalized.includes('moderate') || normalized.includes('present')) {
    return 'bg-orange-950/70 text-orange-300 border border-orange-500/40';
  }

  if (normalized.includes('severe') || normalized.includes('failed')) {
    return 'bg-red-950/70 text-red-300 border border-red-500/40';
  }

  return 'bg-[#1B2438] text-[#9FB3D9] border border-[#2D3D63]';
}

function toDisplayValue(item) {
  const rawValue = item?.value;

  if (rawValue == null || rawValue === '') {
    if (typeof item?.status === 'string' && item.status.length) {
      return item.status;
    }

    return '-';
  }

  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
    return String(rawValue);
  }

  if (isObject(rawValue)) {
    if (typeof rawValue.integrated_label === 'string' && rawValue.integrated_label.length) {
      return rawValue.integrated_label;
    }

    if (isObject(rawValue.probs)) {
      const entries = Object.entries(rawValue.probs).filter(([, value]) => Number.isFinite(value));
      if (entries.length) {
        const [bestLabel, bestValue] = entries.sort((a, b) => b[1] - a[1])[0];
        const probability = `${(bestValue * 100).toFixed(1)}%`;
        return `${bestLabel} (${probability})`;
      }
    }
  }

  return typeof item?.status === 'string' && item.status.length ? item.status : '-';
}

function shouldUsePill(item, valueText) {
  if (item?.editType === 'label') {
    return true;
  }

  if (typeof item?.status === 'string' && item.status.length) {
    return true;
  }

  const normalized = normalizeText(valueText);
  if (!normalized || normalized === '-') {
    return false;
  }

  const startsWithNumber = /^[-+]?\d/.test(normalized);
  return !startsWithNumber;
}

function RowValue({ item, valueText }) {
  const units = typeof item?.units === 'string' && item.units.length ? item.units : '';
  const alreadyHasUnits = units && valueText.toLowerCase().includes(units.toLowerCase());
  const composedValue = alreadyHasUnits ? valueText : `${valueText}${units ? ` ${units}` : ''}`;

  if (shouldUsePill(item, valueText)) {
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass(valueText)}`}>
        {valueText}
      </span>
    );
  }

  return <span className="text-white font-semibold text-[11px]">{composedValue}</span>;
}

function MeasurementRow({ item }) {
  const valueText = toDisplayValue(item);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-[#1A2030] py-1.5 last:border-b-0">
      <div className="text-[10px] tracking-wide text-[#8D98B3] uppercase leading-snug">
        {item?.label || item?.key || 'Measurement'}
      </div>
      <div className="shrink-0 text-right">
        <RowValue item={item} valueText={valueText} />
      </div>
    </div>
  );
}

function MeasurementSection({ title, items }) {
  const safeItems = toArray(items);

  if (!safeItems.length) {
    return null;
  }

  return (
    <section className="rounded border border-[#1A2030] bg-[#0B0F17] overflow-hidden">
      <div className="bg-[#171C27] px-2 py-1 text-[10px] font-bold tracking-wide text-[#A0A9BE] uppercase">
        {title}
      </div>
      <div className="px-2 py-1">
        {safeItems.map(item => (
          <MeasurementRow key={item?.key || item?.label} item={item} />
        ))}
      </div>
    </section>
  );
}

function HeaderActionButton({ label, symbol }) {
  return (
    <button
      type="button"
      className="h-5 w-5 rounded border border-[#2A344A] text-[#9EB0D8] text-[10px] leading-none flex items-center justify-center"
      title={label}
      aria-label={label}
    >
      {symbol}
    </button>
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
      <div className="h-full bg-[#090D14] p-2 text-white">
        <div className="rounded border border-[#1A2030] bg-[#0B0F17] p-3 text-sm text-[#A8B4D0]">
          Waiting for AI measurements payload from parent application.
        </div>
      </div>
    );
  }

  const aiMeasurements = isObject(payload.aiMeasurements) ? payload.aiMeasurements : null;

  if (!aiMeasurements) {
    return (
      <div className="h-full bg-[#090D14] p-2 text-white">
        <div className="rounded border border-[#1A2030] bg-[#0B0F17] p-3 text-sm text-[#A8B4D0]">
          No AI measurements payload received.
        </div>
      </div>
    );
  }

  const state = aiMeasurements.state || payload.state || 'unknown';
  const totalMeasurements =
    typeof aiMeasurements.totalMeasurements === 'number' ? aiMeasurements.totalMeasurements : null;

  const mainMeasurements = toArray(aiMeasurements.mainMeasurements);
  const sections = toArray(aiMeasurements.Measurements).filter(section => toArray(section?.items).length > 0);

  return (
    <div className="h-full overflow-y-auto bg-[#090D14] p-2 text-white">
      <div className="space-y-2">
        <header className="rounded border border-[#1A2030] bg-[#0B0F17] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-bold text-white">AI Echo Report</div>
            <div className="flex items-center gap-1">
              <HeaderActionButton label="Preview" symbol="o" />
              <HeaderActionButton label="Refresh" symbol="r" />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(state)}`}>
              {state}
            </span>
            <span className="rounded-full border border-[#2A344A] bg-[#121928] px-2 py-0.5 text-[10px] text-[#AFC1E6]">
              {sections.length} sections
            </span>
            <span className="rounded-full border border-[#2A344A] bg-[#121928] px-2 py-0.5 text-[10px] text-[#AFC1E6]">
              {totalMeasurements ?? 0} meas
            </span>
          </div>
        </header>

        {mainMeasurements.length > 0 && (
          <MeasurementSection title="KEYPOINT MEASUREMENTS" items={mainMeasurements} />
        )}

        {sections.map((section, index) => (
          <MeasurementSection
            key={(section?.section || 'section') + '-' + index}
            title={SECTION_LABELS[section?.section] || String(section?.section || 'MEASUREMENTS').toUpperCase()}
            items={section?.items}
          />
        ))}

        {state !== 'ready' && (
          <div className="rounded border border-[#2A344A] bg-[#121928] p-2 text-[11px] text-[#AFC1E6]">
            Measurements are not ready yet. This panel updates automatically when new payload arrives.
          </div>
        )}
      </div>
    </div>
  );
}
