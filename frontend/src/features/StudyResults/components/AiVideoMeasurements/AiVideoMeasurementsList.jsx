import React, { useState } from "react";
import AiVideoMeasurementsBox from "./AiVideoMeasurementsBox";

export default function AiVideoMeasurementsList({ instance }) {
    const {
        predicted_view,
        predicted_view_confidence,
        results = [],
        sop_instance_uid,
        instance_number,
    } = instance;

    const hasValidMeasurements = results.some((r) => r.status !== "SKIPPED");
    const isSkippedOnly = results.length > 0 && !hasValidMeasurements;

    const [isExpanded, setIsExpanded] = useState(false);

    const toggleExpand = () => {
        if (!isSkippedOnly) setIsExpanded(!isExpanded);
    };

    const shortUid = sop_instance_uid ? sop_instance_uid.slice(-8) : null;
    const instanceLabel = instance_number
        ? `Instance #${instance_number}`
        : shortUid
            ? `UID …${shortUid}`
            : null;

    return (
        <div
            className={`p-6 rounded-3xl bg-white backdrop-blur-sm shadow-lg border border-border transition-all duration-300 ${
                isSkippedOnly ? "opacity-70 cursor-not-allowed" : "hover:shadow-xl"
            }`}
        >
            {/* View Header (clickable unless skipped) */}
            <div
                className={`flex items-center justify-between mb-3 ${
                    isSkippedOnly ? "cursor-not-allowed" : "cursor-pointer select-none"
                }`}
                onClick={toggleExpand}
            >
                <div className="flex items-center space-x-3">
                    {/* Eye-like icon */}
                    <div className="w-12 h-12 rounded-2xl icon-chip-accent backdrop-blur-sm flex items-center justify-center shadow-sm">
                        <svg
                            className="w-6 h-6 text-accent-main"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                fill="currentColor"
                                opacity="0.8"
                            />
                            <path
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </div>

                    {/* Title and confidence */}
                    <div>
                        <div className="flex items-center space-x-2">
                            <div className="text-lg font-semibold text-foreground tracking-tight">
                                {predicted_view || "Unknown View"}
                            </div>
                            {!isSkippedOnly && (
                                <svg
                                    className={`w-4 h-4 text-gray-500 transform transition-transform duration-300 ${
                                        isExpanded ? "rotate-180" : ""
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            )}
                        </div>

                        {instanceLabel && (
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                                <span className="px-2 py-1 rounded-lg border border-gray-200 bg-white/70">
                                    {instanceLabel}
                                </span>
                            </div>
                        )}

                        {predicted_view_confidence && (
                            <div className="flex items-center space-x-2 mt-0.5">
                                <div className="h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full progress-accent rounded-full transition-all duration-500"
                                        style={{ width: `${predicted_view_confidence * 100}%` }}
                                    />
                                </div>
                                <span className="text-xs font-medium text-gray-600">
                                    {(predicted_view_confidence * 100).toFixed(1)}% View Confidence Score
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Measurement count badge */}
                <div
                    className={`px-3 py-1.5 rounded-xl backdrop-blur-sm border border-white/30 ${
                        isSkippedOnly
                            ? "bg-gray-100"
                            : "badge-accent-soft"
                    }`}
                >
                    <span
                        className={`text-sm font-semibold ${
                            isSkippedOnly
                                ? "text-gray-500"
                                : "text-accent-main"
                        }`}
                    >
                        {isSkippedOnly
                            ? "No measurements available for this view"
                            : `${results.length} ${
                                results.length === 1 ? "measurement" : "measurements"
                            }`}
                    </span>
                </div>
            </div>

            {/* Expandable Section */}
            {!isSkippedOnly && (
                <div
                    className={`transition-opacity duration-300 ${
                        isExpanded ? "opacity-100 mt-5" : "opacity-0 pointer-events-none h-0"
                    }`}
                >
                    {isExpanded && (
                        <>
                            {results.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center border border-gray-200/50">
                                        <svg
                                            className="w-8 h-8 text-gray-400"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </div>
                                    <p className="text-sm text-gray-500 font-medium italic">
                                        No measurements for this view
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center space-y-6 mt-5">
                                    {results.map((result, idx) => (
                                        <div key={idx} className="w-full max-w-[700px]">
                                            <AiVideoMeasurementsBox result={result} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
