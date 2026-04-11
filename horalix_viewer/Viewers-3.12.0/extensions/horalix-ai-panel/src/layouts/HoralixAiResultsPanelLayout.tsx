import React, { useState } from 'react';
import { HoralixAiResultsPayload } from '../horalixAiResults.types';
import AiPanelEmptyState from '../components/AiPanelEmptyState';
import AiPanelSectionSwitcher from '../components/AiPanelSectionSwitcher';
import AiMeasurementsPanel from '../components/ai_measurements/AiMeasurementsPanel';
import AiMeasurementsLoadingState from '../components/ai_measurements/AiMeasurementsLoadingState';
import AiReportPanel from '../components/ai_report/AiReportPanel';
import AiReportLoadingState from '../components/ai_report/AiReportLoadingState';

type Props = {
  payload: HoralixAiResultsPayload | null;
  onRequestSaveStudyAnalysisOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearStudyAnalysisOverride?: (key: string) => void;
  onRequestRegenerateLlmReport?: () => void;
};

type PanelTab = 'measurements' | 'report';

export default function HoralixAiResultsPanelLayout({
  payload,
  onRequestSaveStudyAnalysisOverride,
  onRequestClearStudyAnalysisOverride,
  onRequestRegenerateLlmReport,
}: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('measurements');

  if (!payload) {
    return (
      <AiPanelEmptyState message="Waiting for AI payload from parent application." />
    );
  }

  const editorState = payload.studyAnalysisEditorState ?? null;
  const showReportTab = payload.llmReportEnabled !== false;
  const effectiveTab = showReportTab ? activeTab : 'measurements';

  return (
    <div className="h-full overflow-y-auto bg-[#090D14] p-2 text-white">
      <div className="space-y-2">
        <div className="sticky top-0 z-10 -mx-2 -mt-2 bg-[#090D14]/95 px-2 pt-2 pb-2 backdrop-blur-sm">
          <AiPanelSectionSwitcher
            activeValue={activeTab}
            onChange={value => setActiveTab(value as PanelTab)}
            options={[
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

        {effectiveTab === 'measurements' ? (
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
