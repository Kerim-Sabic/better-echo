import React from 'react';
import {
  GlsBullseyePayload,
  MeasurementItem,
  MeasurementSection,
} from '../../horalixAiResults.types';
import AiPanelHeader from '../AiPanelHeader';
import GlsBullseyePanel from './GlsBullseyePanel';
import MainMeasurements from './MainMeasurements';
import SectionsList from './SectionsList';

type Props = {
  state?: string | null;
  totalMeasurements?: number | null;
  mainMeasurements?: MeasurementItem[];
  measurementSections?: MeasurementSection[];
  glsBullseye?: GlsBullseyePayload | null;
  onRequestSaveStudyAnalysisOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearStudyAnalysisOverride?: (key: string) => void;
};

export default function AiMeasurementsPanel({
  state,
  totalMeasurements,
  mainMeasurements = [],
  measurementSections = [],
  glsBullseye = null,
  onRequestSaveStudyAnalysisOverride,
  onRequestClearStudyAnalysisOverride,
}: Props) {
  return (
    <div className="space-y-2">
      <AiPanelHeader
        title="AI Measurements"
        state={state}
        chips={[
          typeof totalMeasurements === 'number'
            ? `${totalMeasurements} Total Measurements`
            : null,
        ]}
      />

      <MainMeasurements
        items={mainMeasurements}
        onRequestSaveStudyAnalysisOverride={onRequestSaveStudyAnalysisOverride}
        onRequestClearStudyAnalysisOverride={
          onRequestClearStudyAnalysisOverride
        }
      />
      <GlsBullseyePanel bullseye={glsBullseye} />
      <SectionsList
        sections={measurementSections}
        onRequestSaveStudyAnalysisOverride={onRequestSaveStudyAnalysisOverride}
        onRequestClearStudyAnalysisOverride={
          onRequestClearStudyAnalysisOverride
        }
      />
    </div>
  );
}
