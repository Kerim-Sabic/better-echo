import React from "react";
import { TITLEBAR_HEIGHT } from "@/general_components/TitleBar";
import { StudyResultsHeader, EchocardiographyViewer } from "@/features/study_results/components";

export default function StudyResultsLayout({
  navigateBack,
  studyResultsViewModel,
  useOhifAiPanel = true,
  ohifAiPayload = null,
}) {
  const {
    studyUID,
    panEchoEchoprimeState,
    isPolling,
    anyLoading,
    refresh,
  } = studyResultsViewModel ?? {};

  console.log("[STUDY RESULTS LAYOUT] STUDY RESULTS VIEWMODEL:", studyResultsViewModel);

  if (!studyUID) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-gray-600">
        No study selected.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-black">
      <header
        className="fixed left-0 right-0 z-50 h-16 border-b bg-white/90 backdrop-blur"
        style={{ top: TITLEBAR_HEIGHT }}
      >
        <div className="h-full px-6 flex items-center">
          <StudyResultsHeader
            navigateBack={navigateBack}
            studyUID={studyUID}
            panEchoEchoprimeState={panEchoEchoprimeState}
            isPolling={isPolling}
            anyLoading={anyLoading}
            onRefresh={refresh}
          />
        </div>
      </header>

      <main className="flex-1 pt-16">
        <EchocardiographyViewer
          studyUID={studyUID}
          useAiPanel={useOhifAiPanel}
          aiPayload={ohifAiPayload}
        />
      </main>
    </div>
  );
}
