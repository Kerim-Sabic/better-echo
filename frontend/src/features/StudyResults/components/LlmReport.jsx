// src/features/StudyResults/components/LlmReport.jsx
import React from "react";
import { Card, CardContent, CardTitle } from "../../../components/ui/card";

/**
 * Props:
 * - llmReportResults: {
 *     report_md?: string,
 *     diagnoses_json?: Array<{ label: string, rationale?: string, confidence?: number }>,
 *     model?: string,
 *     prompt_version?: string,
 *     raw_text?: string
 *   }
 */
export default function LlmReport({ llmReportResults }) {
  const reportMd = llmReportResults?.report_md || llmReportResults?.raw_text || "";
  const diagnoses = Array.isArray(llmReportResults?.diagnoses_json)
    ? llmReportResults.diagnoses_json
    : [];
  const model = llmReportResults?.model || "—";
  const promptVersion = llmReportResults?.prompt_version || "—";

  // Empty state
  if (!reportMd && diagnoses.length === 0) {
    return (
      <Card className="w-full overflow-hidden">
        <CardContent className="p-6 text-sm text-gray-600">
          No AI report available yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / Meta */}
      <Card className="overflow-hidden">
        <div className="px-6 pt-5">
          <CardTitle className="text-base">AI Report</CardTitle>
        </div>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <MetaPill>Model: {model}</MetaPill>
            <MetaPill variant="muted">Prompt: {promptVersion}</MetaPill>
          </div>
        </CardContent>
      </Card>

      {/* Diagnoses */}
      {diagnoses.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-6 pt-5">
            <CardTitle className="text-base">Diagnoses</CardTitle>
          </div>
          <CardContent className="p-6">
            <ul className="space-y-3">
              {diagnoses.map((d, i) => (
                <li
                  key={`${d?.label || "dx"}-${i}`}
                  className="rounded-lg border bg-gray-50 p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="font-medium text-sm">
                      {d?.label || "—"}
                    </div>
                    {isFiniteNumber(d?.confidence) && (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-800">
                        {toPercent(d.confidence)}
                      </span>
                    )}
                  </div>
                  {d?.rationale && (
                    <div className="text-xs text-gray-600 mt-1">
                      {d.rationale}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Report (markdown shown as pre-wrapped text) */}
      {reportMd && (
        <Card className="overflow-hidden">
          <div className="px-6 pt-5">
            <CardTitle className="text-base">Report Text</CardTitle>
          </div>
          <CardContent className="p-6">
            {/* If you later add react-markdown, replace this block with <ReactMarkdown> */}
            <article className="prose max-w-none prose-headings:mt-3 prose-p:my-2">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-6">
                {reportMd}
              </pre>
            </article>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------- small UI helpers ------------- */

function MetaPill({ children, variant = "default" }) {
  const variants = {
    default: "border-gray-300 bg-white text-gray-700",
    muted: "border-gray-200 bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border",
        variants[variant] || variants.default,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function toPercent(value, digits = 0) {
  if (!isFiniteNumber(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}
