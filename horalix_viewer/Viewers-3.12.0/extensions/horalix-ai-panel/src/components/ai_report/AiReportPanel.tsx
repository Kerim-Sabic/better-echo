import React from 'react';
import { HoralixLlmReportSection } from '../../horalixAiResults.types';
import AiPanelHeader from '../AiPanelHeader';
import AiPanelStatusMessage from '../AiPanelStatusMessage';
import AiReportComponentsList from './AiReportComponentsList';

type Props = {
  state?: string | null;
  sections?: HoralixLlmReportSection[];
  reportGeneratedAt?: string | null;
  hasOverrides?: boolean;
  isReportStale?: boolean;
  canRegenerateAiReport?: boolean;
  isRegeneratingAiReport?: boolean;
  regenerateAiReportErrorMessage?: string | null;
  onRequestRegenerateLlmReport?: () => void;
};

export default function AiReportPanel({
  state,
  sections = [],
  reportGeneratedAt = null,
  hasOverrides = false,
  isReportStale = false,
  canRegenerateAiReport = false,
  isRegeneratingAiReport = false,
  regenerateAiReportErrorMessage = null,
  onRequestRegenerateLlmReport,
}: Props) {
  return (
    <div className="space-y-2">
      <AiPanelHeader
        title="AI Report"
        state={state}
        chips={[reportGeneratedAt ? `Generated ${reportGeneratedAt}` : null]}
      />

      {hasOverrides && (
        <div className="rounded border border-[#1A2030] bg-[#0B0F17] p-2">
          <div className="text-[10px] leading-relaxed text-[#8D98B3]">
            {isReportStale
              ? "Measurements edited since report was generated."
              : "Regenerate report with latest overrides."}
          </div>

          <button
            type="button"
            onClick={onRequestRegenerateLlmReport}
            disabled={!canRegenerateAiReport || isRegeneratingAiReport}
            className="mt-1.5 rounded bg-[#1D4ED8] px-2.5 py-[3px] text-[9px] font-semibold text-white transition hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:bg-[#1E293B] disabled:text-[#4B5975]"
          >
            {isRegeneratingAiReport ? 'Regenerating...' : 'Regenerate Report'}
          </button>
        </div>
      )}

      {isReportStale && (
        <AiPanelStatusMessage
          message="The current AI Report is out of date because one or more measurements were overridden."
          tone="warning"
        />
      )}

      {regenerateAiReportErrorMessage && (
        <AiPanelStatusMessage
          message={regenerateAiReportErrorMessage}
          tone="error"
        />
      )}

      <AiReportComponentsList sections={sections} />
    </div>
  );
}
