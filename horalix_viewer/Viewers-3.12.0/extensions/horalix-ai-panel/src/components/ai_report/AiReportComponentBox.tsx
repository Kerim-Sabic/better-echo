import React from 'react';

type Props = {
  title: string;
  body?: string | null;
  emphasizeTitle?: boolean;
};

export default function AiReportComponentBox({
  title,
  body = null,
  emphasizeTitle = false,
}: Props) {
  return (
    <section className="overflow-hidden rounded border border-[#1A2030] bg-[#0B0F17]">
      <div
        className={`px-2 py-1.5 ${
          emphasizeTitle
            ? 'text-[12px] font-semibold text-white'
            : 'bg-[#171C27] text-[10px] font-bold uppercase tracking-wide text-[#A0A9BE]'
        }`}
      >
        {title}
      </div>

      {body ? (
        <div className="whitespace-pre-wrap px-2 py-2 text-[11px] leading-[1.6] text-[#D6DEEF]">
          {body}
        </div>
      ) : null}
    </section>
  );
}
