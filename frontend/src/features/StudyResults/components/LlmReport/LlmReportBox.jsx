import React from "react";
import ReactMarkdown from "react-markdown";

export default function LlmReportBox({ llmReportResults }) {
    const diagnoses = llmReportResults?.diagnoses_json || [];
    const reportText = llmReportResults?.report_md || llmReportResults?.raw_text;
    const mainTitle = llmReportResults?.display?.mainTitle || "Clinical Echo Report";
    const sections = Array.isArray(llmReportResults?.display?.sections)
        ? llmReportResults.display.sections
        : [];

    return (
        <div className="space-y-6">
            <div
                className="p-6 rounded-3xl bg-white backdrop-blur-sm shadow-lg border border-border"
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

            <div className="p-6 rounded-3xl bg-white shadow-md border border-border">
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
