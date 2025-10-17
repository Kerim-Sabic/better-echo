// src/features/StudyResults/layouts/StudyResultsLayout.jsx
import React, { useState } from "react";

/**
 * Optional component slots:
 * - CineViewer:     React component to render the cine player
 * - Measurements:   React component for predicted measurementsW
 * - LVSegmentation: React component for segmentation previews/files
 * - AIReport:       React component for the AI-generated report
 *
 * Usage (now):
 *   <StudyResultsLayout viewModel={vm} navigateBack={...} />
 *
 * Usage (later, when you have real components):
 *   <StudyResultsLayout
 *     viewModel={vm}
 *     navigateBack={...}
 *     CineViewer={(props) => <EchocardiogramViewerSection {...props} />}
 *     Measurements={(props) => <Measurements {...props} />}
 *     LVSegmentation={(props) => <LVSegmentation {...props} />}
 *     AIReport={(props) => <AIReport {...props} />}
 *   />
 */

export function StudyResultsLayout({
  navigateBack,
  viewModel,
  CineViewer,
  Measurements,
  LVSegmentation,
  AIReport,
}) {
  const { state, study, studyUID, results, refresh, error } = viewModel ?? {};

  const [activeTab, setActiveTab] = useState("measurements"); // 'measurements' | 'segmentation' | 'report'

  // ----- Top-level states -----
  if (state === "loading") {
    return (
      <div className="grid place-items-center min-h-screen text-sm text-gray-600">
        Loading study…
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className="grid place-items-center min-h-screen text-sm text-gray-600">
        Running inference…
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="grid place-items-center min-h-screen">
        <div className="space-y-3 text-center">
          <div className="text-lg font-semibold">Study not found</div>
          <button
            onClick={navigateBack}
            className="px-3 py-1.5 rounded-xl border bg-white"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="grid place-items-center min-h-screen">
        <div className="space-y-3 text-center">
          <div className="text-lg font-semibold">Something went wrong</div>
          <div className="text-sm text-gray-500">{String(error || "")}</div>
          <button
            onClick={navigateBack}
            className="px-3 py-1.5 rounded-xl border bg-white"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ----- Normal (ready) UI -----
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={navigateBack}
            className="px-3 py-1.5 rounded-xl border bg-white"
          >
            ← Back
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              Study Results {studyUID ? `• ${studyUID}` : ""}
            </h1>
            <p className="text-xs text-gray-500 truncate">
              {study?.patient_name ?? "Patient"} • Instance: {study?.instance_id ?? "—"}
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={refresh}
              className="px-3 py-1.5 rounded-xl border bg-white"
            >
              Refresh
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl border bg-white"
            >
              Print / PDF
            </button>
          </div>
        </div>
      </header>

      {/* Body: Left sticky cine + Right tabbed results */}
      <main className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-12 gap-4">
        {/* Left Pane: Cine Viewer (sticky) */}
        <section className="col-span-12 lg:col-span-5 xl:col-span-4">
          <div className="rounded-2xl border bg-white overflow-hidden lg:sticky lg:top-24">
            <div className="border-b px-4 py-2 flex items-center gap-2">
              <div className="text-sm font-medium">Cine Viewer</div>
              {/* put simple view buttons or overlays toggles here if you like */}
            </div>

            {/* Cine content */}
            {CineViewer ? (
              <CineViewer studyUID={studyUID} instanceId={study?.instance_id} />
            ) : (
              <div className="aspect-video bg-black grid place-items-center">
                <div className="text-white text-sm opacity-80">
                  [ Cine viewer component goes here ]
                </div>
              </div>
            )}

            <div className="p-3 flex items-center gap-2">
              <button className="px-2 py-1 border rounded">⏮︎</button>
              <button className="px-2 py-1 border rounded">⏯︎</button>
              <button className="px-2 py-1 border rounded">⏭︎</button>
              <div className="ml-auto text-xs text-gray-500">Overlays ▢</div>
            </div>
          </div>
        </section>

        {/* Right Pane: Tabs + Panels */}
        <section className="col-span-12 lg:col-span-7 xl:col-span-8">
          {/* Tabs */}
          <div className="rounded-2xl border bg-white">
            <div className="flex items-center gap-1 border-b px-2">
              <TabButton
                active={activeTab === "measurements"}
                onClick={() => setActiveTab("measurements")}
              >
                Measurements
              </TabButton>
              <TabButton
                active={activeTab === "segmentation"}
                onClick={() => setActiveTab("segmentation")}
              >
                LV Segmentation
              </TabButton>
              <TabButton
                active={activeTab === "report"}
                onClick={() => setActiveTab("report")}
              >
                AI Report
              </TabButton>
              <div className="ml-auto px-3 py-2 text-xs text-gray-500">
                {/* room for per-tab actions if needed */}
              </div>
            </div>

            {/* Panels */}
            <div className="p-4">
              {activeTab === "measurements" && (
                <>
                  {Measurements ? (
                    <Measurements results={results} />
                  ) : (
                    <PlaceholderCard title="Predicted Measurements">
                      Replace this with your <code>Measurements</code> component.
                    </PlaceholderCard>
                  )}
                </>
              )}

              {activeTab === "segmentation" && (
                <>
                  {LVSegmentation ? (
                    <LVSegmentation studyUID={studyUID} />
                  ) : (
                    <PlaceholderCard title="LV Segmentation">
                      Replace this with your <code>LVSegmentation</code> component.
                    </PlaceholderCard>
                  )}
                </>
              )}

              {activeTab === "report" && (
                <>
                  {AIReport ? (
                    <AIReport studyUID={studyUID} />
                  ) : (
                    <PlaceholderCard title="AI Report">
                      Replace this with your <code>AIReport</code> component.
                    </PlaceholderCard>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer (optional actions) */}
      <footer className="sticky bottom-0 z-40 bg-white/90 backdrop-blur border-t">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="text-xs text-gray-500">
            {/* status text placeholder */}
            Ready
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

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-4 py-2 text-sm border-b-2",
        active
          ? "border-gray-900 text-gray-900"
          : "border-transparent text-gray-500 hover:text-gray-800",
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
