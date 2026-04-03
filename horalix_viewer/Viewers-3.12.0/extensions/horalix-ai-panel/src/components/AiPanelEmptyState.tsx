import React from 'react';

type Props = {
  message: string;
};

export default function AiPanelEmptyState({ message }: Props) {
  return (
    <div className="h-full bg-[#090D14] p-2 text-white">
      <div className="rounded border border-[#1A2030] bg-[#0B0F17] p-3 text-sm text-[#A8B4D0]">
        {message}
      </div>
    </div>
  );
}
