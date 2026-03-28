import React from 'react';
import { HoralixLlmReportSection } from '../../horalixAiResults.types';
import AiReportComponentBox from './AiReportComponentBox';

type Props = {
  sections: HoralixLlmReportSection[];
};

export default function AiReportComponentsList({ sections }: Props) {
  if (!sections.length) {
    return null;
  }

  return (
    <>
      {sections.map((section, index) => {
        const hasContent = Boolean(section?.title || section?.body);

        if (!hasContent) {
          return null;
        }

        return (
          <AiReportComponentBox
            key={`${section.title || 'report-section'}-${index}`}
            title={section.title || `Section ${index + 1}`}
            body={section.body || null}
          />
        );
      })}
    </>
  );
}
