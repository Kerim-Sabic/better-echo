import React from 'react';
import {
  MeasurementItem,
  MeasurementSection,
} from '../../horalixAiResults.types';
import AiPanelHeader from '../AiPanelHeader';
import MainMeasurements from './MainMeasurements';
import SectionsList from './SectionsList';

type Props = {
  state?: string | null;
  totalMeasurements?: number | null;
  mainMeasurements?: MeasurementItem[];
  measurementSections?: MeasurementSection[];
};

export default function AiMeasurementsPanel({
  state,
  totalMeasurements,
  mainMeasurements = [],
  measurementSections = [],
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

      <MainMeasurements items={mainMeasurements} />
      <SectionsList sections={measurementSections} />
    </div>
  );
}
