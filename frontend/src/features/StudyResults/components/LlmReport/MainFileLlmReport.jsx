import React from "react";
import LoadingScreen from "../LoadingScreen";
import LlmReportBox from "./LlmReportBox";

export default function MainFileLlmReport({
    state,
    showLoading,
    isEmpty,
    llmReportResults,
    diagnosesCount,
    isOutOfDate,
    isRegenerating,
    regenerateError,
    canRegenerate,
    onRegenerate,
}) {
    if (showLoading) {
        return <LoadingScreen state={state} />;
    }

    // No results
    if (isEmpty) {
        return (
        <div className="flex flex-col items-center justify-center p-12 space-y-6">
            <div className="relative">
            <div className="w-24 h-24 rounded-3xl icon-chip-accent backdrop-blur-sm flex items-center justify-center shadow-lg">
                <svg
                className="w-12 h-12 text-accent-main"
                viewBox="0 0 24 24"
                fill="none"
                >
                <path
                    d="M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H8l-4-4V6a2 2 0 012-2z"
                    stroke="currentColor"
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
            <div className="w-10 h-10 rounded-2xl icon-chip-accent backdrop-blur-sm flex items-center justify-center shadow-sm">
            <svg
                className="w-5 h-5 text-accent-main"
                viewBox="0 0 24 24"
                fill="none"
            >
                <path
                d="M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H8l-4-4V6a2 2 0 012-2z"
                stroke="currentColor"
                strokeWidth="2"
                />
            </svg>
            </div>

            <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
                AI Echocardiography Report
            </h2>
            <p className="text-xs text-gray-500 font-medium">
                {diagnosesCount} diagnosis finding
                {diagnosesCount !== 1 ? "s" : ""}
            </p>
            </div>

            <div className="flex items-center gap-2">
                {isOutOfDate && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 shadow-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Out of date
                    </span>
                )}
                <button
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-1.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted/60 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={onRegenerate}
                    disabled={!canRegenerate}
                >
                    {isRegenerating ? "Regenerating..." : "Regenerate report"}
                </button>
            </div>
        </div>

        {regenerateError && (
            <div className="text-sm text-red-600">{regenerateError}</div>
        )}

        {/* Actual Report Box */}
        <LlmReportBox llmReportResults={llmReportResults} />
        </div>
    );
}
