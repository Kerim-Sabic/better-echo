import React from 'react';
import { MeasurementItem } from '../../horalixAiResults.types';
import SectionBox from './SectionBox';

type Props = {
  items: MeasurementItem[];
};

export default function MainMeasurements({ items }: Props) {
  if (!items.length) {
    return null;
  }

  return <SectionBox title="KEYPOINT MEASUREMENTS" items={items} />;
}
