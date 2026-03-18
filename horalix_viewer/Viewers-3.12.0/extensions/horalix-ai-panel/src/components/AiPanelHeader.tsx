import React from 'react';

type Props = {
  studyUid?: string | null;
  state?: string | null;
  sectionCount: number;
  totalMeasurements?: number | null;
};

function getStateClassName(state?: string | null) {
  if (state === 'ready') {
    return 'bg-green-950/70 text-green-300 border border-green-500/40';
  }

  if (state === 'pending' || state === 'loading') {
    return 'bg-yellow-950/70 text-yellow-300 border border-yellow-500/40';
  }

  if (state === 'error' || state === 'failed') {
    return 'bg-red-950/70 text-red-300 border border-red-500/40';
  }

  return 'bg-[#182033] text-[#AFC1E6] border border-[#2A395A]';
}

export default function AiPanelHeader({
  state,
  sectionCount,
  totalMeasurements,
}: Props) {
  return (
    <header className="rounded border border-[#1A2030] bg-[#0B0F17] p-2">
      <div className="text-[13px] font-bold text-white">AI Echo Report</div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStateClassName(state)}`}>
          {state || 'loading'}
        </span>

        <span className="rounded-full border border-[#2A344A] bg-[#121928] px-2 py-0.5 text-[10px] text-[#AFC1E6]">
          {sectionCount} Sections
        </span>

        {typeof totalMeasurements === 'number' && (
          <span className="rounded-full border border-[#2A344A] bg-[#121928] px-2 py-0.5 text-[10px] text-[#AFC1E6]">
            {totalMeasurements} Total Measurements
          </span>
        )}
      </div>
    </header>
  );
}
