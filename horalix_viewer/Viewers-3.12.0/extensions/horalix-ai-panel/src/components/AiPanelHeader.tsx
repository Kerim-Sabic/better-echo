import React from 'react';

type Props = {
  title: string;
  state?: string | null;
  chips?: Array<string | null | undefined | false>;
};

function getStateDotColor(state?: string | null) {
  if (state === 'ready') return '#34d399';
  if (state === 'pending' || state === 'loading') return '#fde047';
  if (state === 'error' || state === 'failed') return '#f87171';
  return '#60708F';
}

export default function AiPanelHeader({ title, state, chips = [] }: Props) {
  const visibleChips = chips.filter((chip): chip is string => Boolean(chip));

  return (
    <header className="overflow-hidden rounded border border-[#1A2030] bg-[#0B0F17] px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[11px] font-bold text-white">{title}</div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wide text-[#6B7FA3]">
            {state || 'loading'}
          </span>
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: getStateDotColor(state) }}
          />
        </div>
      </div>

      {visibleChips.length > 0 && (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
          {visibleChips.map((chip, index) => (
            <span
              key={`${chip}-${index}`}
              className="truncate rounded border border-[#1E2A3E] bg-[#0E1420] px-1.5 py-[1px] text-[9px] text-[#8D98B3]"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
