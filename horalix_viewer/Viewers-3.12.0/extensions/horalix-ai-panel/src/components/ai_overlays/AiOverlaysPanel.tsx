import React from 'react';

import {
  HoralixAiOverlay,
  HoralixOverlayViewport,
} from '../../horalixAiResults.types';
import { LvOverlayStatus } from '../../logic/overlays/lvOverlayController';
import {
  overlayIdentity,
  PointLineOverlayStatus,
} from '../../logic/overlays/pointLineOverlayController';

const OPACITY_MAX = 0.6;
const DOPPLER_OVERLAY_KIND = 'doppler_measurement_overlay';

type Props = {
  overlaysState?: string | null;
  overlays: HoralixAiOverlay[];
  visibleViewports: HoralixOverlayViewport[];
  enabledOverlayIds: string[];
  opacity: number;
  onOverlayToggle: (overlayId: string, next: boolean) => void;
  onOpacityChange: (next: number) => void;
  onGoToSelectedFrame?: (viewportId: string, selectedFrameIndex: number) => void;
  lvStatus: LvOverlayStatus;
  pointLineStatus: PointLineOverlayStatus;
};

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

function TargetIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="8"
        cy="8"
        r="1.5"
        fill="currentColor"
      />
      <path
        d="M8 1v3M8 12v3M1 8h3M12 8h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ReviewFlag({ overlay }: { overlay: HoralixAiOverlay }) {
  if (!overlay.lowConfidence) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 shrink-0"
      />
    );
  }
  return (
    <span
      aria-label="Low AI localization confidence. Verify point placement before using this measurement."
      title="Review AI point placement"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2A260F] text-[12px] font-bold text-[#FDE68A] ring-1 ring-[#5C4E1C]"
    >
      !
    </span>
  );
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function selectedFrameIndex(overlay: HoralixAiOverlay): number | null {
  return finiteNumber(overlay.document?.selectedFrameIndex);
}

function groupSelectedFrameIndex(
  overlays: HoralixAiOverlay[],
  viewport: HoralixOverlayViewport
) {
  const currentIndex = finiteNumber(viewport.currentFrameIndex);
  const selectedIndexes = Array.from(
    new Set(
      overlays
        .filter(overlay => overlay.kind === DOPPLER_OVERLAY_KIND)
        .map(selectedFrameIndex)
        .filter((index): index is number => index !== null)
        .filter(index => currentIndex === null || currentIndex !== index)
    )
  );
  return selectedIndexes.length === 1 ? selectedIndexes[0] : null;
}

function overlayLabel(overlay: HoralixAiOverlay) {
  if (overlay.displayName) {
    return overlay.displayName;
  }
  if (overlay.kind === 'lv_segmentation_overlay') {
    return 'LV Segmentation';
  }
  if (overlay.kind === 'linear_measurement_overlay') {
    return 'AI Measurement Overlay';
  }
  if (overlay.kind === DOPPLER_OVERLAY_KIND) {
    return 'AI Measurement Overlay';
  }
  return 'AI Overlay';
}

function familyLabel(overlay: HoralixAiOverlay) {
  if (overlay.familyLabel) {
    return overlay.familyLabel;
  }
  if (overlay.kind === 'lv_segmentation_overlay') {
    return 'LV Segmentation';
  }
  if (overlay.kind === 'linear_measurement_overlay') {
    return '2D Linear';
  }
  if (overlay.kind === DOPPLER_OVERLAY_KIND) {
    return 'Doppler';
  }
  return 'AI Overlay';
}

function overlayColor(overlay: HoralixAiOverlay) {
  if (overlay.kind === DOPPLER_OVERLAY_KIND) {
    return '#FBBF24';
  }
  if (overlay.kind === 'linear_measurement_overlay') {
    return '#38BDF8';
  }
  return '#2DD4BF';
}

function formatMeasurement(overlay: HoralixAiOverlay) {
  if (overlay.summaryValueLabel) {
    return overlay.summaryValueLabel;
  }

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
  visibleViewports,
  enabledOverlayIds,
  opacity,
  onOverlayToggle,
  onOpacityChange,
  onGoToSelectedFrame,
  lvStatus,
  pointLineStatus,
}: Props) {
  const availableOverlays = (overlays || []).filter(overlay => overlay?.available);
  const enabledSet = new Set(enabledOverlayIds);
  const overlaysBySop = new Map<string, HoralixAiOverlay[]>();
  availableOverlays.forEach(overlay => {
    if (!overlay.sopInstanceUid) {
      return;
    }

    const bucket = overlaysBySop.get(overlay.sopInstanceUid) || [];
    bucket.push(overlay);
    overlaysBySop.set(overlay.sopInstanceUid, bucket);
  });
  const viewportGroups = (visibleViewports || [])
    .filter(viewport => viewport.sopInstanceUid)
    .map(viewport => ({
      viewport,
      overlays: overlaysBySop.get(viewport.sopInstanceUid || '') || [],
    }))
    .filter(group => group.overlays.length > 0);
  const visibleOverlayIds = viewportGroups.flatMap(group =>
    group.overlays.map(overlayIdentity)
  );
  const hasAvailable = visibleOverlayIds.length > 0;
  const anyEnabled = visibleOverlayIds.some(id => enabledSet.has(id));
  const visibleEnabledCount = visibleOverlayIds.filter(id => enabledSet.has(id)).length;
  const sliderValue = Math.round((opacity / OPACITY_MAX) * 100);
  const hasDimensionMismatch =
    lvStatus.dimensionMismatch || pointLineStatus.dimensionMismatch;

  return (
    <div className="space-y-3 text-[12px]">
      {hasAvailable && (
        <div className="space-y-3 rounded-lg border border-[#1A2030] bg-[#0B0F17] p-3">
          <div className="space-y-2">
            {viewportGroups.map(group => (
              <div
                key={group.viewport.viewportId}
                className="rounded-md border border-[#1A2030] bg-[#0F1520] p-2"
              >
                <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[11px] font-semibold text-[#C3CCE0]">
                    {group.viewport.viewportLabel ||
                      `Viewport ${group.viewport.viewportIndex + 1}`}
                  </div>
                  {(() => {
                    const targetFrame = groupSelectedFrameIndex(
                      group.overlays,
                      group.viewport
                    );
                    if (targetFrame === null) {
                      return (
                        <div className="text-[10px] tabular-nums text-[#60708F]">
                          {group.overlays.length} overlay
                          {group.overlays.length === 1 ? '' : 's'}
                        </div>
                      );
                    }

                    return (
                      <button
                        type="button"
                        aria-label={`Go to selected Doppler frame ${targetFrame + 1}`}
                        title="Go to selected Doppler frame"
                        onClick={() =>
                          onGoToSelectedFrame?.(
                            group.viewport.viewportId,
                            targetFrame
                          )
                        }
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[#5C4E1C] bg-[#2A260F] px-2 text-[10px] font-semibold text-[#FDE68A] transition-colors hover:bg-[#3A3418]"
                      >
                        <TargetIcon />
                        <span>Go to frame {targetFrame + 1}</span>
                      </button>
                    );
                  })()}
                </div>

                <div className="space-y-2">
                  {group.overlays.map(overlay => {
                    const id = overlayIdentity(overlay);
                    const measurement = formatMeasurement(overlay);
                    const subtitle = familyLabel(overlay);

                    return (
                      <div
                        key={id}
                        className="border-b border-[#1A2030] pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="grid min-h-[44px] grid-cols-[minmax(0,1fr)_24px_auto] items-center gap-2">
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
                              {subtitle}
                              {measurement ? ` - ${measurement}` : ''}
                            </div>
                          </div>
                          <ReviewFlag overlay={overlay} />
                          <Toggle
                            checked={enabledSet.has(id)}
                            disabled={!overlay.available}
                            onChange={next => onOverlayToggle(id, next)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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

          <div className="rounded-md bg-[#121928] px-2 py-1.5">
            <div className="text-[10px] uppercase text-[#60708F]">Overlays</div>
            <div className="text-[13px] font-semibold text-white">
              {visibleEnabledCount}
              <span className="text-[#60708F]">/{visibleOverlayIds.length}</span>
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
