import React from 'react';
import { MeasurementItem } from '../../horalixAiResults.types';
import SectionBox from './SectionBox';

type Props = {
  items: MeasurementItem[];
  onRequestSaveStudyAnalysisOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearStudyAnalysisOverride?: (key: string) => void;
};

export default function MainMeasurements({
  items,
  onRequestSaveStudyAnalysisOverride,
  onRequestClearStudyAnalysisOverride,
}: Props) {
  if (!items.length) {
    return null;
  }

  return (
    <SectionBox
      title="KEYPOINT MEASUREMENTS"
      items={items}
      onRequestSaveStudyAnalysisOverride={onRequestSaveStudyAnalysisOverride}
      onRequestClearStudyAnalysisOverride={
        onRequestClearStudyAnalysisOverride
      }
    />
  );
}
