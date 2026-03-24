import React from 'react';

export type AiPanelSectionOption = {
  value: string;
  label: string;
  state?: string | null;
};

type Props = {
  options: AiPanelSectionOption[];
  activeValue: string;
  onChange: (value: string) => void;
};

function getButtonClassName(isActive: boolean) {
  if (isActive) {
    return 'border-[#36507D] bg-[#121928] text-white shadow-[inset_0_0_0_1px_rgba(83,139,255,0.15)]';
  }

  return 'border-[#1A2030] bg-[#0B0F17] text-[#8D98B3] hover:text-white';
}

function getDotClassName(state?: string | null) {
  if (state === 'ready') {
    return 'bg-green-400';
  }

  if (state === 'pending' || state === 'loading') {
    return 'bg-yellow-400';
  }

  if (state === 'error' || state === 'failed') {
    return 'bg-red-400';
  }

  return 'bg-[#60708F]';
}

export default function AiPanelSectionSwitcher({
  options,
  activeValue,
  onChange,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex items-center justify-between rounded border px-3 py-2 text-left transition-colors ${getButtonClassName(
            activeValue === option.value
          )}`}
        >
          <span className="text-[12px] font-semibold">{option.label}</span>

          <span className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-[#8D98B3]">
              {option.state || 'idle'}
            </span>
            <span
              className={`inline-block h-2 w-2 rounded-full ${getDotClassName(
                option.state
              )}`}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
