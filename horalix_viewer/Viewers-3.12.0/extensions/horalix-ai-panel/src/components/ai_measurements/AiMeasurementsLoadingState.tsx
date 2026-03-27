import React from 'react';
import AiPanelHeader from '../AiPanelHeader';
import AiPanelStatusMessage from '../AiPanelStatusMessage';

type Props = {
  state?: string | null;
};

export default function AiMeasurementsLoadingState({ state }: Props) {
  let message = 'Waiting for AI Measurements.';
  let tone: 'info' | 'warning' | 'error' = 'info';

  if (state === 'pending' || state === 'loading') {
    message = 'Calculating the AI Measurements.';
    tone = 'warning';
  }

  if (state === 'failed' || state === 'error') {
    message = 'AI Measurements could not be loaded.';
    tone = 'error';
  }

  if (state === 'not_found') {
    message = 'No AI Measurements available for this study.';
    tone = 'info';
  }

  return (
    <div className="space-y-2">
      <AiPanelHeader title="AI Measurements" state={state} />
      <AiPanelStatusMessage message={message} tone={tone} />
    </div>
  );
}
