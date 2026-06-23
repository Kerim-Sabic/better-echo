import React from 'react';

import { HoralixAiOverlay } from '../../horalixAiResults.types';
import { LvOverlayStatus } from '../../logic/overlays/lvOverlayController';

const OPACITY_MAX = 0.6;

type Props = {
  overlaysState?: string | null;
  overlays: HoralixAiOverlay[];
  enabled: boolean;
  opacity: number;
  onToggle: (next: boolean) => void;
  onOpacityChange: (next: number) => void;
  status: LvOverlayStatus;
};

function statusChip(label: string, tone: 'ok' | 'busy' | 'bad' | 'idle') {
  const toneClass =
    tone === 'ok'
      ? 'bg-[#0F2A22] text-[#34D399] ring-1 ring-[#1C5045]'
      : tone === 'busy'
        ? 'bg-[#2A260F] text-[#FBBF24] ring-1 ring-[#5C4E1C]'
        : tone === 'bad'
          ? 'bg-[#2A1314] text-[#F87171] ring-1 ring-[#5C2122]'
          : 'bg-[#121928] text-[#8D98B3] ring-1 ring-[#1A2030]';

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}>
      {label}
    </span>
  );
}

function resolveStatusChip(
  overlaysState: string | null | undefined,
  primary: HoralixAiOverlay | null
) {
  const status = primary?.status;
  if (status === 'failed') {
    return statusChip('Failed', 'bad');
  }
  if (status === 'running' || status === 'queued' || overlaysState === 'pending') {
    return statusChip(status === 'queued' ? 'Queued' : 'Running', 'busy');
  }
  if (primary?.available) {
    return statusChip('Completed', 'ok');
  }
  if (overlaysState === 'loading') {
    return statusChip('Loading', 'busy');
  }
  return statusChip('Not available', 'idle');
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[#2DD4BF]' : 'bg-[#283044]'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return `${Math.round(value * 100)}%`;
}

export default function AiOverlaysPanel({
  overlaysState,
  overlays,
  enabled,
  opacity,
  onToggle,
  onOpacityChange,
  status,
}: Props) {
  const availableOverlays = (overlays || []).filter(overlay => overlay?.available);
  const primary =
    availableOverlays.find(
      overlay => overlay.sopInstanceUid === status.sopInstanceUid
    ) ||
    availableOverlays[0] ||
    (overlays || [])[0] ||
    null;

  const hasAvailable = availableOverlays.length > 0;
  const sliderValue = Math.round((opacity / OPACITY_MAX) * 100);

  return (
    <div className="space-y-3 text-[12px]">
      <div className="rounded-lg border border-[#1A2030] bg-[#0B0F17] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2DD4BF]" />
            <span className="font-semibold text-white">AI LV Mask</span>
          </div>
          <Toggle
            checked={enabled && hasAvailable}
            disabled={!hasAvailable}
            onChange={onToggle}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-[#8D98B3]">Overlay layer</span>
          {resolveStatusChip(overlaysState, primary)}
        </div>
      </div>

      {hasAvailable && (
        <div className="space-y-3 rounded-lg border border-[#1A2030] bg-[#0B0F17] p-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-[#8D98B3]">Opacity</span>
              <span className="text-[11px] tabular-nums text-[#C3CCE0]">
                {sliderValue}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sliderValue}
              disabled={!enabled}
              onChange={event =>
                onOpacityChange((Number(event.target.value) / 100) * OPACITY_MAX)
              }
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[#283044] accent-[#2DD4BF] disabled:opacity-40"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-[#121928] px-2 py-1.5">
              <div className="text-[10px] uppercase text-[#60708F]">Confidence</div>
              <div className="text-[13px] font-semibold text-white">
                {formatConfidence(primary?.meanConfidence)}
              </div>
            </div>
            <div className="rounded-md bg-[#121928] px-2 py-1.5">
              <div className="text-[10px] uppercase text-[#60708F]">Frames</div>
              <div className="text-[13px] font-semibold text-white">
                {primary?.framesWithMask ?? '-'}
                <span className="text-[#60708F]">/{primary?.frameCount ?? '-'}</span>
              </div>
            </div>
          </div>

          {primary?.modelName && (
            <div className="text-[10px] text-[#60708F]">
              {primary.modelName}
              {primary.modelVersion ? ` - ${primary.modelVersion}` : ''}
            </div>
          )}
        </div>
      )}

      {status.dimensionMismatch && (
        <div className="rounded-lg border border-[#5C2122] bg-[#2A1314] p-3 text-[11px] text-[#F8B4B4]">
          Overlay hidden: the AI mask dimensions or frame count do not match this image.
          Re-run analysis on the original instance to restore the overlay.
        </div>
      )}

      {!hasAvailable && overlaysState !== 'loading' && overlaysState !== 'pending' && (
        <div className="rounded-lg border border-[#1A2030] bg-[#0B0F17] p-3 text-[11px] text-[#8D98B3]">
          No AI overlay is available for the displayed instance. LV overlays are produced for
          apical-4-chamber cines during analysis.
        </div>
      )}

      {(overlaysState === 'pending' || overlaysState === 'loading') && !hasAvailable && (
        <div className="rounded-lg border border-[#1A2030] bg-[#0B0F17] p-3 text-[11px] text-[#8D98B3]">
          Preparing AI overlay...
        </div>
      )}

      <p className="px-0.5 text-[10px] leading-relaxed text-[#60708F]">
        AI-assisted result for clinical review, not a diagnosis. The overlay is rendered on
        the original study; the underlying DICOM is never modified.
      </p>
    </div>
  );
}
