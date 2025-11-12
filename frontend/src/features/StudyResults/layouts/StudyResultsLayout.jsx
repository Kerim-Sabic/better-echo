import React, { useState } from "react";
import EchocardiogramViewer from "../components/EchocardiogramViewer";
import Header from "../components/Header";
import MainFileAiMeasurements from "../components/AiMeasurements/MainFileAiMeasurements";
import MainFileAiVideoMeasurements from "../components/AiVideoMeasurements/MainFileAiVideoMeasurements";
import LlmReport from "../components/LlmReport";


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

  const [activeTab, setActiveTab] = useState("measurements"); // 'measurements' | 'segmentation' | 'report'

  // ----- Minimal fallback check -----
  if (!studyUID) {
    return (
      <div className="grid place-items-center min-h-screen text-sm text-gray-600">
        No study selected.
      </div>
    );
  }
  
  // Compute combined loading for footer/status display
  const anyLoading =
    ["loading", "pending"].includes(panEchoEchoprimeState) ||
    ["loading", "pending"].includes(dynamicMeasurementsState) ||
    ["loading", "pending"].includes(llmReportState);

  // ----- Normal (ready) UI -----
  return (
    // Add pt-16 to offset the FIXED header (h-16)
    <div className="min-h-screen bg-gray-50 pt-16">
      {/* Fixed header */}
      <div className="w-full">
        <Header
          navigateBack={navigateBack}
          studyUID={studyUID}
          hasMeasurements={hasMeasurements}
          isPolling={isPolling}
          onRefresh={refresh}
        />
      </div>

      {/* Full-bleed grid */}
      <main className="w-full px-6 py-4 grid grid-cols-12 gap-6 2xl:gap-8">
        {/* Left Pane: Cine Viewer */}
        <section className="col-span-12 lg:col-span-6">
          {/* Stick just below fixed header */}
          <div className="lg:sticky lg:top-16">
            <EchocardiogramViewer studyUID={studyUID} />
          </div>
        </section>

        {/* Right Pane: local sticky tab bar + panels */}
        <section className="col-span-12 lg:col-span-6">
          {/* Right-only sticky tab bar (sits under fixed header) */}
          <div className="sticky top-16 z-40">
            <div className="bg-white/90 backdrop-blur border rounded-xl px-3 py-2 flex items-center gap-2">
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

              <div className="ml-auto text-xs text-gray-500 whitespace-nowrap">
                {anyLoading ? "Updating…" : "Ready"}
              </div>
            </div>
          </div>

          {/* Panels */}
          <div className="mt-3 rounded-2xl border bg-white">
            <div className="p-4">
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
                <LlmReport
                  state={llmReportState} 
                  llmReportResults={llmReportResults}
                />
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="sticky bottom-0 z-40 bg-white/90 backdrop-blur border-t">
        <div className="w-full px-6 py-3 flex items-center gap-2">
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
