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
        className={`px-3 py-2 ${
          emphasizeTitle
            ? 'text-sm font-semibold text-white'
            : 'bg-[#171C27] text-[11px] font-bold tracking-wide text-[#A0A9BE]'
        }`}
      >
        {title}
      </div>

      {body ? (
        <div className="whitespace-pre-wrap px-3 py-3 text-[12px] leading-5 text-[#D6DEEF]">
          {body}
        </div>
      ) : null}
    </section>
  );
}
