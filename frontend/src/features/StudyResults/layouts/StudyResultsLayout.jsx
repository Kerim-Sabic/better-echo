import React from "react";
import EchocardiogramViewer from "../components/EchocardiogramViewer";
import Header from "../components/Header";
import MainFileAiMeasurements from "../components/AiMeasurements/MainFileAiMeasurements";
import MainFileAiVideoMeasurements from "../components/AiVideoMeasurements/MainFileAiVideoMeasurements";
import MainFileLlmReport from "../components/LlmReport/MainFileLlmReport";
import Viewer from "../../../components/Viewer";
import { TITLEBAR_HEIGHT } from "../../../components/TitleBar";

export function StudyResultsLayout({
  navigateBack,
  viewModel,
  useOhifAiPanel = false,
  ohifAiPayload = null,
}) {
  const {
    studyUID,
    hasMeasurements,
    isPolling,
    refresh,
    patientName,
    patientSex,
    aiMeasurements = {},
    aiVideoMeasurements = {},
    llmReport = {},
    activeTab = "measurements",
    setActiveTab = () => {},
    anyLoading = false,
    onPrint,
  } = viewModel ?? {};

  const { canIndex = false, isIndexedMode = false, onSetIndexedMode = () => {} } = aiMeasurements ?? {};

  if (!studyUID) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-gray-600">
        No study selected.
      </div>
    );
  }

  if (useOhifAiPanel) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-black">
        <header
          className="fixed left-0 right-0 z-50 h-16 border-b bg-white/90 backdrop-blur"
          style={{ top: TITLEBAR_HEIGHT }}
        >
          <div className="h-full px-6 flex items-center">
            <Header
              navigateBack={navigateBack}
              studyUID={studyUID}
              patientName={patientName}
              patientSex={patientSex}
              hasMeasurements={hasMeasurements}
              isPolling={isPolling}
              onRefresh={refresh}
            onPrint={onPrint}
            />
          </div>
        </header>

        <main className="flex-1 pt-16">
          <Viewer studyUID={studyUID} aiPayload={ohifAiPayload} useAiPanel />
        </main>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f8f8f8]">
      <header
        className="fixed left-0 right-0 z-50 h-16 border-b bg-white/90 backdrop-blur"
        style={{ top: TITLEBAR_HEIGHT }}
      >
        <div className="h-full px-6 flex items-center">
          <Header
            navigateBack={navigateBack}
            studyUID={studyUID}
            patientName={patientName}
            patientSex={patientSex}
            hasMeasurements={hasMeasurements}
            isPolling={isPolling}
            onRefresh={refresh}
            onPrint={onPrint}
          />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden pt-16 pb-14">
        <section className="h-full w-full overflow-auto p-6 lg:w-1/2">
          <EchocardiogramViewer studyUID={studyUID} />
        </section>

        <section className="flex h-full w-full flex-col overflow-y-auto p-6 lg:w-1/2">
          <div className="sticky top-0 z-40 flex items-center gap-2 rounded-xl border bg-white/90 px-3 py-2 backdrop-blur">
            <Pill isActive={activeTab === "measurements"} onClick={() => setActiveTab("measurements")}>
              AI Measurements
            </Pill>
            <Pill isActive={activeTab === "segmentation"} onClick={() => setActiveTab("segmentation")}>
              AI Segmentations
            </Pill>
            <Pill isActive={activeTab === "report"} onClick={() => setActiveTab("report")}>
              AI Report
            </Pill>

            <div className="ml-auto flex items-center gap-2">
              {canIndex && (
                <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
                  <button
                    type="button"
                    onClick={() => onSetIndexedMode(true)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      isIndexedMode
                        ? "bg-muted text-foreground border-border"
                        : "bg-card text-foreground border-border hover:bg-muted/60",
                    ].join(" ")}
                  >
                    Indexed
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetIndexedMode(false)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      !isIndexedMode
                        ? "bg-muted text-foreground border-border"
                        : "bg-card text-foreground border-border hover:bg-muted/60",
                    ].join(" ")}
                  >
                    Raw
                  </button>
                </div>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-xs text-gray-600">
                {anyLoading ? "Updating..." : "Ready"}
              </span>
            </div>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto rounded-2xl border bg-white p-4">
            {activeTab === "measurements" && <MainFileAiMeasurements {...aiMeasurements} />}
            {activeTab === "segmentation" && <MainFileAiVideoMeasurements {...aiVideoMeasurements} />}
            {activeTab === "report" &&
              (llmReport.state === undefined ? (
                <div className="p-8 text-center text-sm text-gray-600">
                  LLM reports are disabled in this build.
                </div>
              ) : (
                <MainFileLlmReport {...llmReport} />
              ))}
          </div>
        </section>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-50 h-14 border-t bg-white/90 backdrop-blur">
        <div className="h-full px-6 flex items-center">
          <div className="text-xs text-gray-500">{anyLoading ? "Polling for results..." : "Ready"}</div>
          <div className="ml-auto flex items-center gap-2">
            <button className="cursor-not-allowed rounded-xl border bg-white px-3 py-1.5 text-gray-400" disabled>
              Send to PACS
            </button>
            <button
              className="cursor-not-allowed rounded-xl border bg-gray-200 px-3 py-1.5 text-gray-500"
              disabled
            >
              Approve / Sign
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Pill({ isActive, onClick, children }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      className={[
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        isActive
          ? "bg-muted text-foreground border-border"
          : "bg-card text-foreground border-border hover:bg-muted/60",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
