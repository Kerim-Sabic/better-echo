import React from 'react';
import AiPanelHeader from '../AiPanelHeader';
import AiPanelStatusMessage from '../AiPanelStatusMessage';

type Props = {
  state?: string | null;
  detail?: string | null;
  hasOverrides?: boolean;
  isReportStale?: boolean;
  canRegenerateAiReport?: boolean;
  isRegeneratingAiReport?: boolean;
  regenerateAiReportErrorMessage?: string | null;
  onRequestRegenerateLlmReport?: () => void;
};

export default function AiReportLoadingState({
  state,
  detail,
  hasOverrides = false,
  isReportStale = false,
  canRegenerateAiReport = false,
  isRegeneratingAiReport = false,
  regenerateAiReportErrorMessage = null,
  onRequestRegenerateLlmReport,
}: Props) {
  let message = 'Waiting for AI Echo Report.';
  let tone: 'info' | 'warning' | 'error' = 'info';

  if (state === 'pending' || state === 'loading') {
    message = 'AI Echo Report is being generated.';
    tone = 'warning';
  }

  if (state === 'failed' || state === 'error') {
    message = detail || 'AI Echo Report generation failed.';
    tone = 'error';
  }

  if (state === 'not_found') {
    message = 'No AI Echo Report available.';
    tone = 'info';
  }

  return (
    <div className="space-y-2">
      <AiPanelHeader title="AI Echo Report" state={state} />

      {hasOverrides && (
        <div className="rounded border border-[#1A2030] bg-[#0B0F17] p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-[#AFC1E6]">
              {isReportStale
                ? "Measurements were edited after the last AI Report."
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

      {regenerateAiReportErrorMessage && (
        <AiPanelStatusMessage
          message={regenerateAiReportErrorMessage}
          tone="error"
        />
      )}

      <AiPanelStatusMessage message={message} tone={tone} />
    </div>
  );
}
