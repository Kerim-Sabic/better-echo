// src/features/StudyResults/components/Header.jsx
import React from "react";
import { TITLEBAR_HEIGHT } from "../../../components/TitleBar";

export default function Header({
  navigateBack,
  studyUID,
  hasMeasurements,
  isPolling,
  onRefresh,
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-white/90 backdrop-blur border-b h-16" style={{ marginTop: `${TITLEBAR_HEIGHT}px` }}>
      <div className="w-full h-full px-6 flex items-center gap-3">
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
            {hasMeasurements ? "Measurements available" : "No measurements yet"}
          </p>
        </div>

        <div className="hidden md:flex items-center gap-2">
          {isPolling && (
            <span className="px-2 py-1 text-xs rounded-lg border bg-yellow-50 text-yellow-800">
              Polling…
            </span>
          )}
          <button
            onClick={onRefresh}
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
  );
}
