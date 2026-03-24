import React from 'react';
import { MeasurementSection } from '../../horalixAiResults.types';
import SectionBox from './SectionBox';

type Props = {
  sections: MeasurementSection[];
};

const SECTION_TITLES: Record<string, string> = {
  Valves: 'VALVES',
  'LV Size & Function': 'LEFT VENTRICLE',
  Atria: 'ATRIA',
  'Right Heart': 'RIGHT HEART',
  Aorta: 'AORTA',
  'Devices / Procedures': 'DEVICES / PROCEDURES',
};

function formatSectionTitle(section?: string) {
  if (!section) {
    return 'MEASUREMENTS';
  }

  return SECTION_TITLES[section] || section.toUpperCase();
}

export default function SectionsList({ sections }: Props) {
  if (!sections.length) {
    return null;
  }

  return (
    <>
      {sections.map((section, index) => (
        <SectionBox
          key={`${section.section || 'section'}-${index}`}
          title={formatSectionTitle(section.section)}
          items={section.items ?? []}
        />
      ))}
    </>
  );
}
