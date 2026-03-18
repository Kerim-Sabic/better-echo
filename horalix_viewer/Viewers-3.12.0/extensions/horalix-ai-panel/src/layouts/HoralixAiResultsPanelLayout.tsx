import React from 'react';
import { HoralixAiResultsPayload } from '../horalixAiResults.types';
import AiPanelHeader from '../components/AiPanelHeader';
import MainMeasurements from '../components/MainMeasurements';
import SectionsList from '../components/SectionsList';

type Props = {
  payload: HoralixAiResultsPayload | null;
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full bg-[#090D14] p-2 text-white">
      <div className="rounded border border-[#1A2030] bg-[#0B0F17] p-3 text-sm text-[#A8B4D0]">
        {message}
      </div>
    </div>
  );
}

export default function HoralixAiResultsPanelLayout({ payload }: Props) {
  if (!payload) {
    return <EmptyState message="Waiting for AI measurements payload from parent application." />;
  }

  const state = payload.panechoEchoprimeCombinedResultsState ?? 'loading';
  const aiMeasurements = payload.panechoEchoprimeAiMeasurements;

  if (!aiMeasurements) {
    return <EmptyState message="No AI measurements payload received." />;
  }

  const mainMeasurements = aiMeasurements.mainMeasurements ?? [];
  const measurementSections = (aiMeasurements.measurementSections ?? []).filter(
    section => (section.items ?? []).length > 0
  );

  return (
    <div className="h-full overflow-y-auto bg-[#090D14] p-2 text-white">
      <div className="space-y-2">
        <AiPanelHeader
          state={state}
          sectionCount={measurementSections.length}
          totalMeasurements={aiMeasurements.totalMeasurements}
        />

        <MainMeasurements items={mainMeasurements} />
        <SectionsList sections={measurementSections} />

        {state !== 'ready' && (
          <div className="rounded border border-[#2A344A] bg-[#121928] p-2 text-[11px] text-[#AFC1E6]">
            Measurements are not ready yet. This panel updates automatically when new payload arrives.
          </div>
        )}
      </div>
    </div>
  );
}
