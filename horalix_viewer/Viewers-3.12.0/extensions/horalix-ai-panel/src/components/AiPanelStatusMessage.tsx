import React from 'react';

export type AiPanelMessageTone = 'info' | 'warning' | 'error';

type Props = {
  message: string;
  tone?: AiPanelMessageTone;
};

function getMessageClassName(tone: AiPanelMessageTone) {
  if (tone === 'warning') {
    return 'border-yellow-500/30 bg-yellow-950/30 text-yellow-100';
  }

  if (tone === 'error') {
    return 'border-red-500/30 bg-red-950/30 text-red-100';
  }

  return 'border-[#2A344A] bg-[#121928] text-[#AFC1E6]';
}

export default function AiPanelStatusMessage({
  message,
  tone = 'info',
}: Props) {
  return (
    <div
      className={`rounded border p-2 text-[11px] leading-5 ${getMessageClassName(
        tone
      )}`}
    >
      {message}
    </div>
  );
}
