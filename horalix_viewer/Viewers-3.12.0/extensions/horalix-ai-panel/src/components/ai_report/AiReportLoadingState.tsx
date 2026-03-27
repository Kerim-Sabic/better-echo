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
