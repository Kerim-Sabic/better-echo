import React from "react";
import ReactMarkdown from "react-markdown";

export default function LlmReportBox({ llmReportResults }) {
  const diagnoses = llmReportResults?.diagnoses_json || [];
  const reportText = llmReportResults?.report_md || llmReportResults?.raw_text;

  return (
    <div className="space-y-6">

      {/* Diagnoses Section */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-white via-white to-purple-50/30 
        backdrop-blur-sm shadow-lg border border-white/40">
        
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Diagnoses Summary
        </h3>

        {diagnoses.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No diagnoses found.</p>
        ) : (
          <ul className="space-y-4">
            {diagnoses.map((item, idx) => (
              <li key={idx} className="p-4 rounded-xl bg-white/70 shadow-sm border">
                <p className="text-gray-800 font-semibold">{item.label}</p>
                <p className="text-sm text-gray-600 mt-1">{item.rationale}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Confidence: {(item.confidence * 100).toFixed(0)}%
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Full Report Markdown */}
      <div className="p-6 rounded-3xl bg-white shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Full Clinical Report
        </h3>

        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{reportText}</ReactMarkdown>
        </div>
      </div>

    </div>
  );
}
