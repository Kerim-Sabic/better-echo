import React from "react";
import MainMeasurementBox from "./MainMeasurementBox";

export default function MainMeasurementsList({ mainMeasurements }) {
  if (!Array.isArray(mainMeasurements) || mainMeasurements.length === 0)
    return null;

  const safeId = "main_measurements";

  return (
    <div
      className="
        p-6 rounded-3xl
        bg-gradient-to-br from-white via-white to-purple-50/30
        backdrop-blur-sm shadow-lg border border-white/40
        transition-all duration-300
        hover:shadow-xl
      "
    >
      {/* HEADER — matches MeasurementsList style */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          {/* Icon box */}
          <div
            className="
              w-12 h-12 rounded-2xl 
              bg-gradient-to-br from-purple-500/20 to-cyan-500/20
              backdrop-blur-sm flex items-center justify-center 
              border border-white/30 shadow-sm
            "
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <defs>
                <linearGradient
                  id={`grad-${safeId}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#9333EA" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>

              <path
                d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"
                fill={`url(#grad-${safeId})`}
                opacity="0.7"
              />

              <path
                d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"
                stroke={`url(#grad-${safeId})`}
                strokeWidth="1.5"
              />
            </svg>
          </div>

          {/* Section title */}
          <div className="text-lg font-semibold text-gray-800 tracking-tight">
            Key Measurements
          </div>
        </div>

        {/* Optional: measurement count badge */}
        <div
          className="
            px-3 py-1.5 rounded-xl
            bg-gradient-to-br from-purple-500/10 to-cyan-500/10
            backdrop-blur-sm border border-white/30 shadow-sm
          "
        >
          <span
            className="
              text-sm font-semibold
              bg-gradient-to-r from-purple-600 to-cyan-600
              bg-clip-text text-transparent
            "
          >
            {mainMeasurements.length} values
          </span>
        </div>
      </div>

      {/* GRID OF MAIN MEASUREMENTS */}
      <div
        className="
          grid gap-5
          grid-cols-[repeat(auto-fit,minmax(200px,max-content))]
          justify-center
        "
      >
        {mainMeasurements.map((m) => (
          <MainMeasurementBox key={m.key} mainMeasurement={m} />
        ))}
      </div>
    </div>
  );
}
