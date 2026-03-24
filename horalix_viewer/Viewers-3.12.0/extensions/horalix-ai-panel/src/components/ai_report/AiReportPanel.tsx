import React from 'react';
import { HoralixLlmReportSection } from '../../horalixAiResults.types';
import AiPanelHeader from '../AiPanelHeader';
import AiReportComponentsList from './AiReportComponentsList';

type Props = {
  state?: string | null;
  sections?: HoralixLlmReportSection[];
  reportGeneratedAt?: string | null;
};

export default function AiReportPanel({
  state,
  sections = [],
  reportGeneratedAt = null,
}: Props) {
  return (
    <div className="space-y-2">
      <AiPanelHeader
        title="AI Report"
        state={state}
        chips={[reportGeneratedAt ? `Generated ${reportGeneratedAt}` : null]}
      />
      <AiReportComponentsList sections={sections} />
    </div>
  );
}
