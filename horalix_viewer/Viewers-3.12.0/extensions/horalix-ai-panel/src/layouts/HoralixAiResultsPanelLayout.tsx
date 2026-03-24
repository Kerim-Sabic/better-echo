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
};

type PanelTab = 'measurements' | 'report';

export default function HoralixAiResultsPanelLayout({ payload }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('measurements');

  if (!payload) {
    return (
      <AiPanelEmptyState message="Waiting for AI payload from parent application." />
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#090D14] p-2 text-white">
      <div className="space-y-2">
        <AiPanelSectionSwitcher
          activeValue={activeTab}
          onChange={value => setActiveTab(value as PanelTab)}
          options={[
            {
              value: 'measurements',
              label: 'AI Measurements',
              state: payload.panechoEchoprimeCombinedResultsState,
            },
            {
              value: 'report',
              label: 'AI Report',
              state: payload.llmReportResultsState,
            },
          ]}
        />

        {activeTab === 'measurements' ? (
          payload.panechoEchoprimeCombinedResultsState === 'ready' ? (
            <AiMeasurementsPanel
              state={payload.panechoEchoprimeCombinedResultsState}
              totalMeasurements={
                payload.panechoEchoprimeAiMeasurements?.totalMeasurements
              }
              mainMeasurements={
                payload.panechoEchoprimeAiMeasurements?.mainMeasurements ?? []
              }
              measurementSections={
                payload.panechoEchoprimeAiMeasurements?.measurementSections ?? []
              }
            />
          ) : (
            <AiMeasurementsLoadingState
              state={payload.panechoEchoprimeCombinedResultsState}
            />
          )
        ) : payload.llmReportResultsState === 'ready' ? (
          <AiReportPanel
            state={payload.llmReportResultsState}
            sections={payload.llmEchoReport?.sections ?? []}
            reportGeneratedAt={payload.llmEchoReport?.reportGeneratedAt ?? null}
          />
        ) : (
          <AiReportLoadingState
            state={payload.llmReportResultsState}
            detail={payload.llmReportResultsDetail ?? null}
          />
        )}
      </div>
    </div>
  );
}
