import React from "react";
import LoadingScreen from "../LoadingScreen";
import LlmReportBox from "./LlmReportBox";

export default function MainFileLlmReport({ state, llmReportResults }) {

  if (state !== "ready") {
    return <LoadingScreen state={state} />;
  }

  // No results
  if (!llmReportResults) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 
            backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/20">
            <svg
              className="w-12 h-12 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <defs>
                <linearGradient id="reportGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#9333EA" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <path
                d="M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H8l-4-4V6a2 2 0 012-2z"
                stroke="url(#reportGradient)"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
        <div className="text-center space-y-2 max-w-xs">
          <p className="text-base font-semibold text-gray-800 tracking-tight">No Report</p>
          <p className="text-sm text-gray-500 font-medium leading-relaxed">
            No AI Echo report generated for this study.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      
      {/* Header Section */}
      <div className="flex items-center space-x-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 
          backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-sm">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
          >
            <defs>
              <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9333EA" />
                <stop offset="100%" stopColor="#06B6D4" />
              </linearGradient>
            </defs>
            <path
              d="M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H8l-4-4V6a2 2 0 012-2z"
              stroke="url(#headerGradient)"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-800 tracking-tight">
            AI Echocardiography Report
          </h2>
          <p className="text-xs text-gray-500 font-medium">
            {llmReportResults?.diagnoses_json?.length || 0} diagnosis finding
            {llmReportResults?.diagnoses_json?.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Actual Report Box */}
      <LlmReportBox llmReportResults={llmReportResults} />
    </div>
  );
}
