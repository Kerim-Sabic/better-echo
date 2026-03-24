import React from 'react';
import AiPanelHeader from '../AiPanelHeader';
import AiPanelStatusMessage from '../AiPanelStatusMessage';

type Props = {
  state?: string | null;
  detail?: string | null;
};

export default function AiReportLoadingState({ state, detail }: Props) {
  let message = 'Waiting for AI Echo Report.';
  let tone: 'info' | 'warning' | 'error' = 'info';

  if (state === 'pending' || state === 'loading') {
    message =
      'AI Echo Report is being generated.';
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
      <AiPanelStatusMessage message={message} tone={tone} />
    </div>
  );
}
