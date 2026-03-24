import React from 'react';

type Props = {
  title: string;
  state?: string | null;
  chips?: Array<string | null | undefined | false>;
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

export default function AiPanelHeader({ title, state, chips = [] }: Props) {
  const visibleChips = chips.filter((chip): chip is string => Boolean(chip));

  return (
    <header className="rounded border border-[#1A2030] bg-[#0B0F17] p-2">
      <div className="text-[13px] font-bold text-white">{title}</div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStateClassName(
            state
          )}`}
        >
          {state || 'loading'}
        </span>

        {visibleChips.map((chip, index) => (
          <span
            key={`${chip}-${index}`}
            className="rounded-full border border-[#2A344A] bg-[#121928] px-2 py-0.5 text-[10px] text-[#AFC1E6]"
          >
            {chip}
          </span>
        ))}
      </div>
    </header>
  );
}
