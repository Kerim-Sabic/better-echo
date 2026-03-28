import React from 'react';
import { MeasurementItem } from '../../horalixAiResults.types';
import SectionBox from './SectionBox';

type Props = {
  items: MeasurementItem[];
  onRequestSavePanechoOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearPanechoOverride?: (key: string) => void;
};

export default function MainMeasurements({
  items,
  onRequestSavePanechoOverride,
  onRequestClearPanechoOverride,
}: Props) {
  if (!items.length) {
    return null;
  }

  return (
    <SectionBox
      title="KEYPOINT MEASUREMENTS"
      items={items}
      onRequestSavePanechoOverride={onRequestSavePanechoOverride}
      onRequestClearPanechoOverride={onRequestClearPanechoOverride}
    />
  );
}
