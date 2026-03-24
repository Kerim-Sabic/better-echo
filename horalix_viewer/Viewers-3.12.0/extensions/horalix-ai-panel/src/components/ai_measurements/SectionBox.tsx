import React from 'react';
import { MeasurementItem } from '../../horalixAiResults.types';

type Props = {
  title: string;
  items: MeasurementItem[];
};

function getDotColor(color?: string | null) {
  if (color === 'green') {
    return '#34d399';
  }

  if (color === 'yellow') {
    return '#fde047';
  }

  if (color === 'orange') {
    return '#fb923c';
  }

  if (color === 'red') {
    return '#f87171';
  }

  return '#94a3b8';
}

function formatDisplayValue(item: MeasurementItem) {
  if (item.displayValue === 0) {
    return '0';
  }

  if (item.displayValue) {
    return String(item.displayValue);
  }

  return '-';
}

function MeasurementRow({ item }: { item: MeasurementItem }) {
  const value = formatDisplayValue(item);
  const alreadyContainsUnits =
    Boolean(item.units) &&
    value.toLowerCase().includes(String(item.units).toLowerCase());

  return (
    <div className="flex items-center justify-between gap-2 border-b border-[#1A2030] py-1.5 last:border-b-0">
      <div className="text-[10px] leading-snug tracking-wide text-[#8D98B3] uppercase">
        {item.label || item.key || 'Measurement'}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-right">
        <span className="text-[11px] font-semibold text-white">
          {value}
          {item.units && !alreadyContainsUnits ? ` ${item.units}` : ''}
        </span>

        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: getDotColor(item.color) }}
        />

        {item.discrepancy && (
          <span
            className="inline-block cursor-help text-[11px] font-bold leading-none text-red-400"
            title="Discrepancy, there is uncertainty about this measurement."
            aria-label="Discrepancy, there is uncertainty about this measurement."
          >
            !
          </span>
        )}
      </div>
    </div>
  );
}

export default function SectionBox({ title, items }: Props) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded border border-[#1A2030] bg-[#0B0F17]">
      <div className="bg-[#171C27] px-2 py-1 text-[10px] font-bold tracking-wide text-[#A0A9BE] uppercase">
        {title}
      </div>

      <div className="px-2 py-1">
        {items.map(item => (
          <MeasurementRow key={item.key || item.label} item={item} />
        ))}
      </div>
    </section>
  );
}
