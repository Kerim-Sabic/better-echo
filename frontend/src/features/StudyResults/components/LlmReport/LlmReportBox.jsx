import React from "react";
import ReactMarkdown from "react-markdown";

function parseReportSections(reportText) {
  const text = (reportText || "").replace(/\r\n/g, "\n").trim();

  if (!text) {
    return { mainTitle: "Clinical Echo Report", sections: [] };
  }

  const lines = text.split("\n");

  let mainTitle = "Clinical Echo Report";
  let startIndex = 0;

  if (lines[0].startsWith("# ")) {
    const title = lines[0].replace(/^#\s+/, "").trim();
    if (title) {
      mainTitle = title;
    }
    startIndex = 1;
  } else {
    const idx = lines.findIndex((line) => line.startsWith("# "));
    if (idx !== -1) {
      const title = lines[idx].replace(/^#\s+/, "").trim();
      if (title) {
        mainTitle = title;
      }
      startIndex = idx + 1;
    }
  }

  const rest = lines.slice(startIndex).join("\n").trim();
  if (!rest) {
    return { mainTitle, sections: [] };
  }

  const rawSections = rest.split(/\n(?=##\s+)/);

  const sections = rawSections
    .map((chunk) => {
      const chunkLines = chunk.split("\n");
      let title = "";
      let bodyLines = chunkLines;

      if (chunkLines[0].startsWith("## ")) {
        title = chunkLines[0].replace(/^##\s+/, "").trim();
        bodyLines = chunkLines.slice(1);
      }

      const body = bodyLines.join("\n").trim();

      if (!title && body) {
        const firstNonEmpty = bodyLines.find((line) => line.trim().length > 0) || "";
        title = firstNonEmpty.replace(/^#+\s+/, "").trim();
      }

      return { title, body };
    })
    .filter((section) => section.body);

  return { mainTitle, sections };
}

export default function LlmReportBox({ llmReportResults }) {
    const diagnoses = llmReportResults?.diagnoses_json || [];
    const reportText = llmReportResults?.report_md || llmReportResults?.raw_text;

    const { mainTitle, sections } = parseReportSections(reportText);

    return (
        <div className="space-y-6">
            <div
                className="p-6 rounded-3xl bg-gradient-to-br from-white via-white to-purple-50/30 
        backdrop-blur-sm shadow-lg border border-white/40"
            >
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Diagnoses Summary
                </h3>

                {diagnoses.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No diagnoses found.</p>
                ) : (
                    <ul className="space-y-4">
                        {diagnoses.map((item, idx) => (
                            <li
                                key={idx}
                                className="p-4 rounded-xl bg-white/70 shadow-sm border"
                            >
                                <p className="text-gray-800 font-semibold">{item.label}</p>
                                <p className="text-sm text-gray-600 mt-1">{item.rationale}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Confidence: {Number.isFinite(item.confidence) ? (item.confidence * 100).toFixed(0) : "-"}%
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="p-6 rounded-3xl bg-white shadow-md border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    {mainTitle}
                </h3>

                {sections.length === 0 ? (
                    <div className="prose prose-sm max-w-none text-gray-700">
                        <ReactMarkdown>{reportText}</ReactMarkdown>
                    </div>
                ) : (
                    <ul className="space-y-4">
                        {sections.map((section, idx) => (
                            <li
                                key={idx}
                                className="p-4 rounded-xl bg-white/70 shadow-sm border"
                            >
                                {section.title && (
                                    <p className="text-gray-800 font-semibold">
                                        {section.title}
                                    </p>
                                )}
                                {section.body && (
                                    <div className="mt-2 prose prose-sm max-w-none text-gray-700">
                                        <ReactMarkdown>{section.body}</ReactMarkdown>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
