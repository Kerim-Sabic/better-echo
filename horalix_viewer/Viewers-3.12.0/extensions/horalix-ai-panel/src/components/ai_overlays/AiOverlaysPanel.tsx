import React from 'react';

import { HoralixAiOverlay } from '../../horalixAiResults.types';
import { LvOverlayStatus } from '../../logic/overlays/lvOverlayController';
import {
  overlayIdentity,
  PointLineOverlayStatus,
} from '../../logic/overlays/pointLineOverlayController';

const OPACITY_MAX = 0.6;

type Props = {
  overlaysState?: string | null;
  overlays: HoralixAiOverlay[];
  enabledOverlayIds: string[];
  opacity: number;
  onOverlayToggle: (overlayId: string, next: boolean) => void;
  onOpacityChange: (next: number) => void;
  lvStatus: LvOverlayStatus;
  pointLineStatus: PointLineOverlayStatus;
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
  overlay: HoralixAiOverlay | null
) {
  const status = overlay?.status;
  if (status === 'failed') {
    return statusChip('Failed', 'bad');
  }
  if (status === 'running' || status === 'queued' || overlaysState === 'pending') {
    return statusChip(status === 'queued' ? 'Queued' : 'Running', 'busy');
  }
  if (overlay?.available) {
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

function overlayLabel(overlay: HoralixAiOverlay) {
  if (overlay.kind === 'lv_segmentation_overlay') {
    return 'AI LV Mask';
  }
  if (overlay.kind === 'linear_measurement_overlay') {
    return '2D Linear';
  }
  if (overlay.kind === 'doppler_measurement_overlay') {
    return 'Doppler';
  }
  return 'AI Overlay';
}

function overlayColor(overlay: HoralixAiOverlay) {
  if (overlay.kind === 'doppler_measurement_overlay') {
    return '#FBBF24';
  }
  if (overlay.kind === 'linear_measurement_overlay') {
    return '#38BDF8';
  }
  return '#2DD4BF';
}

function formatMeasurement(overlay: HoralixAiOverlay) {
  const value = overlay.measurementValue;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return `${rounded}${overlay.measurementUnits ? ` ${overlay.measurementUnits}` : ''}`;
}

export default function AiOverlaysPanel({
  overlaysState,
  overlays,
  enabledOverlayIds,
  opacity,
  onOverlayToggle,
  onOpacityChange,
  lvStatus,
  pointLineStatus,
}: Props) {
  const availableOverlays = (overlays || []).filter(overlay => overlay?.available);
  const enabledSet = new Set(enabledOverlayIds);
  const hasAvailable = availableOverlays.length > 0;
  const anyEnabled = availableOverlays.some(overlay =>
    enabledSet.has(overlayIdentity(overlay))
  );
  const sliderValue = Math.round((opacity / OPACITY_MAX) * 100);
  const hasDimensionMismatch =
    lvStatus.dimensionMismatch || pointLineStatus.dimensionMismatch;

  return (
    <div className="space-y-3 text-[12px]">
      {hasAvailable && (
        <div className="space-y-3 rounded-lg border border-[#1A2030] bg-[#0B0F17] p-3">
          <div className="space-y-2">
            {availableOverlays.map(overlay => {
              const id = overlayIdentity(overlay);
              const measurement = formatMeasurement(overlay);

              return (
                <div key={id} className="border-b border-[#1A2030] pb-2 last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: overlayColor(overlay) }}
                        />
                        <span className="truncate text-[12px] font-semibold text-white">
                          {overlayLabel(overlay)}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-[#8D98B3]">
                        {overlay.overlayKey || overlay.modelName || 'default'}
                        {measurement ? ` - ${measurement}` : ''}
                      </div>
                    </div>
                    <Toggle
                      checked={enabledSet.has(id)}
                      disabled={!overlay.available}
                      onChange={next => onOverlayToggle(id, next)}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="truncate pr-2 text-[10px] text-[#60708F]">
                      {overlay.sopInstanceUid || '-'}
                    </span>
                    {resolveStatusChip(overlaysState, overlay)}
                  </div>
                </div>
              );
            })}
          </div>

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
              disabled={!anyEnabled}
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
                {formatConfidence(
                  availableOverlays.find(
                    overlay => typeof overlay.meanConfidence === 'number'
                  )?.meanConfidence
                )}
              </div>
            </div>
            <div className="rounded-md bg-[#121928] px-2 py-1.5">
              <div className="text-[10px] uppercase text-[#60708F]">Overlays</div>
              <div className="text-[13px] font-semibold text-white">
                {enabledOverlayIds.length}
                <span className="text-[#60708F]">/{availableOverlays.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasDimensionMismatch && (
        <div className="rounded-lg border border-[#5C2122] bg-[#2A1314] p-3 text-[11px] text-[#F8B4B4]">
          Overlay hidden: the AI overlay dimensions do not match this image.
          Re-run analysis on the original instance to restore the overlay.
        </div>
      )}

      {pointLineStatus.selectedFrameHidden && (
        <div className="rounded-lg border border-[#5C4E1C] bg-[#2A260F] p-3 text-[11px] text-[#FDE68A]">
          Doppler overlay is available on its selected source frame.
        </div>
      )}

      {!hasAvailable && overlaysState !== 'loading' && overlaysState !== 'pending' && (
        <div className="rounded-lg border border-[#1A2030] bg-[#0B0F17] p-3 text-[11px] text-[#8D98B3]">
          No AI overlay is available for the displayed instance.
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
