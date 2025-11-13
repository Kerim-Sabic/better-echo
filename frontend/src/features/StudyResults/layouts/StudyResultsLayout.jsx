import React, { useState } from "react";
import EchocardiogramViewer from "../components/EchocardiogramViewer";
import Header from "../components/Header";
import MainFileAiMeasurements from "../components/AiMeasurements/MainFileAiMeasurements";
import MainFileAiVideoMeasurements from "../components/AiVideoMeasurements/MainFileAiVideoMeasurements";
import MainFileLlmReport from "../components/LlmReport/MainFileLlmReport";


export function StudyResultsLayout({ navigateBack, viewModel }) {
  const {
    state,
    error,

    panEchoEchoprimeState,
    dynamicMeasurementsState,
    llmReportState,

    studyUID,

    panechoEchoprimeResults,
    dynamicMeasurementsResults,
    llmReportResults,

    hasMeasurements,
    isPolling,
    refresh,
  } = viewModel ?? {};

  const [activeTab, setActiveTab] = useState("measurements");

  if (!studyUID) {
    return (
      <div className="grid place-items-center min-h-screen text-sm text-gray-600">
        No study selected.
      </div>
    );
  }

  const anyLoading =
    ["loading", "pending"].includes(panEchoEchoprimeState) ||
    ["loading", "pending"].includes(dynamicMeasurementsState) ||
    ["loading", "pending"].includes(llmReportState);

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* -------- Header -------- */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b h-16">
        <div className="h-full px-6 flex items-center">
          <Header
            navigateBack={navigateBack}
            studyUID={studyUID}
            hasMeasurements={hasMeasurements}
            isPolling={isPolling}
            onRefresh={refresh}
          />
        </div>
      </header>

      {/* -------- MAIN CONTENT AREA  -------- */}
      <div className="flex flex-1 pt-16 pb-14 overflow-hidden">

        {/* -------- LEFT VIEWER PANE -------- */}
        <section className="w-full lg:w-1/2 h-full overflow-auto p-6">
          <EchocardiogramViewer studyUID={studyUID} />
        </section>

        {/* -------- RIGHT PANE -------- */}
        <section className="w-full lg:w-1/2 h-full flex flex-col overflow-hidden p-6">

          {/* Sticky tab bar inside right column */}
          <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border rounded-xl px-3 py-2 flex items-center gap-2">
            <Pill
              isActive={activeTab === "measurements"}
              onClick={() => setActiveTab("measurements")}
            >
              AI Measurements
            </Pill>
            <Pill
              isActive={activeTab === "segmentation"}
              onClick={() => setActiveTab("segmentation")}
            >
              AI Segmentations
            </Pill>
            <Pill
              isActive={activeTab === "report"}
              onClick={() => setActiveTab("report")}
            >
              AI Report
            </Pill>

            <div className="ml-auto text-xs text-gray-500">
              {anyLoading ? "Updating…" : "Ready"}
            </div>
          </div>

          {/* Scrollable panel content */}
          <div className="flex-1 overflow-y-auto mt-3 rounded-2xl border bg-white p-4">
            {activeTab === "measurements" && (
              <MainFileAiMeasurements
                state={panEchoEchoprimeState}
                panechoEchoprimeResults={panechoEchoprimeResults}
              />
            )}
            {activeTab === "segmentation" && (
              <MainFileAiVideoMeasurements
                state={dynamicMeasurementsState}
                dynamicMeasurementsResults={dynamicMeasurementsResults}
              />
            )}
            {activeTab === "report" && (
              <MainFileLlmReport
                state={llmReportState}
                llmReportResults={llmReportResults}
              />
            )}
          </div>

        </section>
      </div>

      {/* -------- FOOTER -------- */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-t h-14">
        <div className="h-full px-6 flex items-center">
          <div className="text-xs text-gray-500">
            {anyLoading ? "Polling for results…" : "Ready"}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-xl border bg-white">
              Send to PACS
            </button>
            <button className="px-3 py-1.5 rounded-xl border bg-gray-900 text-white">
              Approve / Sign
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}


/* -------------------- helpers -------------------- */

function Pill({ isActive, onClick, children }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      className={[
        "px-3 py-1.5 rounded-full text-sm border",
        isActive
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function PlaceholderCard({ title, children }) {
  return (
    <div className="rounded-xl border bg-gray-50 p-5 text-sm text-gray-600">
      <div className="font-semibold mb-1">{title}</div>
      <div>{children}</div>
    </div>
  );
}
