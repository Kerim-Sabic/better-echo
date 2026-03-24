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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-[#AFC1E6]">
              {isReportStale
                ? "Measurements were edited after this report was generated."
                : "You can regenerate the AI Report using the latest overridden measurements."}
            </div>

            <button
              type="button"
              onClick={onRequestRegenerateLlmReport}
              disabled={!canRegenerateAiReport || isRegeneratingAiReport}
              className="rounded border border-[#1D4ED8] bg-[#1D4ED8] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:border-[#334155] disabled:bg-[#1E293B] disabled:text-[#94A3B8]"
            >
              {isRegeneratingAiReport ? 'Regenerating...' : 'Regenerate AI Report'}
            </button>
          </div>
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
