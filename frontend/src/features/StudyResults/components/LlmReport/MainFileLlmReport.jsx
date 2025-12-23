import React, { useMemo, useState } from "react";
import LoadingScreen from "../LoadingScreen";
import LlmReportBox from "./LlmReportBox";
import { generateLlmReport } from "../../../../api/orchestration_apis/LlmReportResultsApi";

export default function MainFileLlmReport({
    state,
    llmReportResults,
    studyUID,
    hasOverrides,
    latestOverrideAt,
    onRefresh,
}) {
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regenerateError, setRegenerateError] = useState(null);
    const reportGeneratedAt = llmReportResults?.report_generated_at ?? null;
    const isOutOfDate = useMemo(() => {
        if (!latestOverrideAt || !reportGeneratedAt) return false;
        const overrideTs = new Date(latestOverrideAt).getTime();
        const reportTs = new Date(reportGeneratedAt).getTime();
        if (!Number.isFinite(overrideTs) || !Number.isFinite(reportTs)) return false;
        return overrideTs > reportTs;
    }, [latestOverrideAt, reportGeneratedAt]);

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
                    d="M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H8l-4-4V6a2 2 0 012-2z"git 
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

    const handleRegenerate = async () => {
        if (!studyUID || isRegenerating) return;
        setIsRegenerating(true);
        setRegenerateError(null);
        try {
            const resp = await generateLlmReport(studyUID);
            if (resp.status >= 400) {
                throw new Error("Failed to regenerate report");
            }
            if (onRefresh) {
                onRefresh();
            }
        } catch (err) {
            setRegenerateError("Failed to regenerate report.");
        } finally {
            setIsRegenerating(false);
        }
    };

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

            <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-800 tracking-tight">
                AI Echocardiography Report
            </h2>
            <p className="text-xs text-gray-500 font-medium">
                {llmReportResults?.diagnoses_json?.length || 0} diagnosis finding
                {llmReportResults?.diagnoses_json?.length !== 1 ? "s" : ""}
            </p>
            </div>

            {hasOverrides && (
                <div className="flex items-center gap-2">
                    {isOutOfDate && (
                        <span className="rounded-full border bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                            Out of date
                        </span>
                    )}
                    <button
                        className="rounded-xl border bg-white px-3 py-1.5 text-sm text-gray-700"
                        onClick={handleRegenerate}
                        disabled={isRegenerating}
                    >
                        {isRegenerating ? "Regenerating..." : "Regenerate report"}
                    </button>
                </div>
            )}
        </div>

        {regenerateError && (
            <div className="text-sm text-red-600">{regenerateError}</div>
        )}

        {/* Actual Report Box */}
        <LlmReportBox llmReportResults={llmReportResults} />
        </div>
    );
}
