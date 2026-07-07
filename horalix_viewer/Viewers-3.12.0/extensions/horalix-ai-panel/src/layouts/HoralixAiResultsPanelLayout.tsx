import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  HoralixAiResultsPayload,
  HoralixOverlayViewport,
} from '../horalixAiResults.types';
import AiPanelEmptyState from '../components/AiPanelEmptyState';
import AiPanelSectionSwitcher from '../components/AiPanelSectionSwitcher';
import AiMeasurementsPanel from '../components/ai_measurements/AiMeasurementsPanel';
import AiMeasurementsLoadingState from '../components/ai_measurements/AiMeasurementsLoadingState';
import AiReportPanel from '../components/ai_report/AiReportPanel';
import AiReportLoadingState from '../components/ai_report/AiReportLoadingState';
import AiOverlaysPanel from '../components/ai_overlays/AiOverlaysPanel';
import { useLvMaskOverlay } from '../logic/overlays/lvOverlayController';
import {
  OVERLAY_VIEWPORT_RECONCILE_INTERVAL_MS,
  resolveVisibleOverlayViewports,
  sameOverlayViewports,
} from '../logic/overlays/overlayViewportState';
import {
  overlayIdentity,
  usePointLineOverlays,
} from '../logic/overlays/pointLineOverlayController';

type Props = {
  payload: HoralixAiResultsPayload | null;
  servicesManager?: any;
  commandsManager?: any;
  onRequestSaveStudyAnalysisOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearStudyAnalysisOverride?: (key: string) => void;
  onRequestRegenerateLlmReport?: () => void;
};

type PanelTab = 'overlays' | 'measurements' | 'report';

export default function HoralixAiResultsPanelLayout({
  payload,
  servicesManager,
  commandsManager,
  onRequestSaveStudyAnalysisOverride,
  onRequestClearStudyAnalysisOverride,
  onRequestRegenerateLlmReport,
}: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('measurements');
  const [disabledOverlayIds, setDisabledOverlayIds] = useState<string[]>([]);
  const [overlayOpacity, setOverlayOpacity] = useState(0.28);
  const [visibleOverlayViewports, setVisibleOverlayViewports] = useState<
    HoralixOverlayViewport[]
  >([]);
  const autoRevealedRef = useRef(false);

  const aiOverlays = payload?.aiOverlays ?? [];
  const visibleOverlaySops = useMemo(() => {
    return new Set(
      visibleOverlayViewports
        .map(viewport => viewport.sopInstanceUid)
        .filter((sop): sop is string => Boolean(sop))
    );
  }, [visibleOverlayViewports]);
  const hasVisibleAvailableOverlay = aiOverlays.some(
    overlay =>
      overlay?.available &&
      Boolean(
        overlay.sopInstanceUid && visibleOverlaySops.has(overlay.sopInstanceUid)
      )
  );
  const enabledOverlayIds = useMemo(() => {
    return aiOverlays
      .filter(overlay => overlay?.available)
      .map(overlayIdentity)
      .filter(id => !disabledOverlayIds.includes(id));
  }, [aiOverlays, disabledOverlayIds]);
  const enabledAiOverlays = useMemo(() => {
    const enabledSet = new Set(enabledOverlayIds);
    return aiOverlays.filter(overlay => enabledSet.has(overlayIdentity(overlay)));
  }, [aiOverlays, enabledOverlayIds]);

  const handleOverlayToggle = (overlayId: string, next: boolean) => {
    setDisabledOverlayIds(previous => {
      if (next) {
        return previous.filter(id => id !== overlayId);
      }
      return previous.includes(overlayId) ? previous : [...previous, overlayId];
    });
  };

  const handleGoToSelectedFrame = (viewportId: string, selectedFrameIndex: number) => {
    if (!viewportId || !Number.isFinite(selectedFrameIndex)) {
      return;
    }

    const options = {
      imageIndex: selectedFrameIndex,
      viewport: { id: viewportId },
    };

    try {
      if (typeof commandsManager?.run === 'function') {
        commandsManager.run('jumpToImage', options);
        return;
      }

      commandsManager?.runCommand?.('jumpToImage', options);
    } catch {
      return;
    }
  };

  useEffect(() => {
    const reconcile = () => {
      const next = resolveVisibleOverlayViewports(servicesManager);
      setVisibleOverlayViewports(previous =>
        sameOverlayViewports(previous, next) ? previous : next
      );
    };

    reconcile();
    const interval = window.setInterval(
      reconcile,
      OVERLAY_VIEWPORT_RECONCILE_INTERVAL_MS
    );

    return () => window.clearInterval(interval);
  }, [servicesManager]);

  useEffect(() => {
    if (!hasVisibleAvailableOverlay || autoRevealedRef.current) {
      return;
    }

    autoRevealedRef.current = true;
    setActiveTab('overlays');
  }, [hasVisibleAvailableOverlay]);

  const lvOverlayStatus = useLvMaskOverlay({
    servicesManager,
    overlays: enabledAiOverlays,
    enabled: enabledAiOverlays.length > 0,
    opacity: overlayOpacity,
  });
  const pointLineOverlayStatus = usePointLineOverlays({
    servicesManager,
    overlays: enabledAiOverlays,
    enabled: enabledAiOverlays.length > 0,
    opacity: overlayOpacity,
  });

  if (!payload) {
    return (
      <AiPanelEmptyState message="Waiting for AI payload from parent application." />
    );
  }

  const editorState = payload.studyAnalysisEditorState ?? null;
  const showReportTab = payload.llmReportEnabled !== false;
  const effectiveTab = showReportTab || activeTab !== 'report' ? activeTab : 'measurements';
  const overlaysState = payload.aiOverlaysState ?? null;
  const overlaysTabState = hasVisibleAvailableOverlay ? 'ready' : overlaysState;

  return (
    <div className="h-full overflow-y-auto bg-[#090D14] p-2 text-white">
      <div className="space-y-2">
        <div className="sticky top-0 z-10 -mx-2 -mt-2 bg-[#090D14]/95 px-2 pt-2 pb-2 backdrop-blur-sm">
          <AiPanelSectionSwitcher
            activeValue={effectiveTab}
            onChange={value => setActiveTab(value as PanelTab)}
            options={[
              {
                value: 'overlays',
                label: 'AI Overlay',
                state: overlaysTabState,
              },
              {
                value: 'measurements',
                label: 'AI Measurements',
                state: payload.studyAnalysisCombinedResultsState,
              },
              ...(showReportTab
                ? [
                    {
                      value: 'report',
                      label: 'AI Report',
                      state: payload.llmReportResultsState,
                    },
                  ]
                : []),
            ]}
          />
        </div>

        {effectiveTab === 'overlays' ? (
          <AiOverlaysPanel
            overlaysState={overlaysState}
            overlays={aiOverlays}
            visibleViewports={visibleOverlayViewports}
            enabledOverlayIds={enabledOverlayIds}
            opacity={overlayOpacity}
            onOverlayToggle={handleOverlayToggle}
            onOpacityChange={setOverlayOpacity}
            onGoToSelectedFrame={handleGoToSelectedFrame}
            lvStatus={lvOverlayStatus}
            pointLineStatus={pointLineOverlayStatus}
          />
        ) : effectiveTab === 'measurements' ? (
          payload.studyAnalysisCombinedResultsState === 'ready' ? (
            <AiMeasurementsPanel
              state={payload.studyAnalysisCombinedResultsState}
              totalMeasurements={
                payload.studyAnalysisMeasurements?.totalMeasurements
              }
              mainMeasurements={
                payload.studyAnalysisMeasurements?.mainMeasurements ?? []
              }
              measurementSections={
                payload.studyAnalysisMeasurements?.measurementSections ?? []
              }
              glsBullseye={
                payload.studyAnalysisMeasurements?.glsBullseye ?? null
              }
              onRequestSaveStudyAnalysisOverride={
                onRequestSaveStudyAnalysisOverride
              }
              onRequestClearStudyAnalysisOverride={
                onRequestClearStudyAnalysisOverride
              }
            />
          ) : (
            <AiMeasurementsLoadingState
              state={payload.studyAnalysisCombinedResultsState}
            />
          )
        ) : payload.llmReportResultsState === 'ready' ? (
          <AiReportPanel
            state={payload.llmReportResultsState}
            sections={payload.llmEchoReport?.sections ?? []}
            reportGeneratedAt={payload.llmEchoReport?.reportGeneratedAt ?? null}
            hasOverrides={editorState?.hasOverrides ?? false}
            isReportStale={editorState?.isReportStale ?? false}
            canRegenerateAiReport={editorState?.canRegenerateAiReport ?? false}
            isRegeneratingAiReport={editorState?.isRegeneratingAiReport ?? false}
            regenerateAiReportErrorMessage={
              editorState?.regenerateAiReportErrorMessage ?? null
            }
            onRequestRegenerateLlmReport={onRequestRegenerateLlmReport}
          />
        ) : (
          <AiReportLoadingState
            state={payload.llmReportResultsState}
            detail={payload.llmReportResultsDetail ?? null}
            hasOverrides={editorState?.hasOverrides ?? false}
            isReportStale={editorState?.isReportStale ?? false}
            canRegenerateAiReport={editorState?.canRegenerateAiReport ?? false}
            isRegeneratingAiReport={editorState?.isRegeneratingAiReport ?? false}
            regenerateAiReportErrorMessage={
              editorState?.regenerateAiReportErrorMessage ?? null
            }
            onRequestRegenerateLlmReport={onRequestRegenerateLlmReport}
          />
        )}
      </div>
    </div>
  );
}
