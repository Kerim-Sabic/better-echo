// src/features/StudyResults/components/Header.jsx
import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../../general_components/ui/button";
import { Copy } from "lucide-react";

export default function Header({
    navigateBack,
    studyUID,
    patientName: providedPatientName,
    patientSex,
    hasMeasurements,
    isPolling,
    onRefresh,
    onPrint,
}) {
    const [patientName, setPatientName] = useState(providedPatientName || null);

    useEffect(() => {
        setPatientName(providedPatientName || null);
    }, [providedPatientName]);

    const [copied, setCopied] = useState(false);
    const handleCopyStudyUid = async () => {
        if (!studyUID || !navigator?.clipboard?.writeText) return;
        try {
            await navigator.clipboard.writeText(studyUID);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            setCopied(false);
        }
    };

    const statusChip = (() => {
        if (isPolling) {
            return (
                <span className="px-2 py-1 text-xs rounded-full badge-accent-soft">
                    Processing
                </span>
            );
        }
        if (hasMeasurements) {
            return (
                <span className="px-2 py-1 text-xs rounded-full badge-accent-soft">
                    Ready
                </span>
            );
        }
        return (
            <span className="px-2 py-1 text-xs rounded-full border border-border text-foreground">
                No Data
            </span>
        );
    })();

    const displaySex = (() => {
        if (!patientSex) return null;
        const cleaned = String(patientSex).trim().toUpperCase();
        if (cleaned === "M") return "Male";
        if (cleaned === "F") return "Female";
        if (cleaned === "O") return "Other";
        if (cleaned === "U") return "Unknown";
        return patientSex;
    })();

    return (
        <div className="w-full flex items-center justify-between gap-4">
            {/* Left section: Back + Logo + Title */}
            <div className="flex items-center gap-4 min-w-0">
                <Button
                    variant="ghost"
                    onClick={navigateBack}
                    className="gap-2 hover:scale-105 hover:bg-primary/10 hover:text-primary fast-transition"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back
                </Button>

                <img
                    src="/horalix-taskbar-app-icon.png"
                    alt="Horalix Logo"
                    className="w-10 h-10"
                />

                <div className="min-w-0">
                    <h1 className="text-2xl font-bold heading-accent truncate">
                        Study Results
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 pb-1 text-xs text-muted-foreground">
                        <span className="px-2 py-1 rounded-lg border border-gray-200 bg-white/70">
                            Patient: {patientName || "-"}
                        </span>
                        {displaySex && (
                            <span className="px-2 py-1 rounded-lg border border-gray-200 bg-white/70">
                                Sex: {displaySex}
                            </span>
                        )}
                        <span className="px-2 py-1 rounded-lg border border-gray-200 bg-white/70 flex items-center gap-1">
                            UID: <span className="truncate max-w-[180px]">{studyUID || "-"}</span>
                        </span>
                        {studyUID && (
                            <button
                                type="button"
                                onClick={handleCopyStudyUid}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span>{copied ? "Copied" : "Copy UID"}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Right actions */}
            <div className="hidden md:flex items-center gap-2 ml-auto">
                {statusChip}
                <Button variant="outline" onClick={onRefresh}>Refresh</Button>
                <Button variant="gradient" onClick={onPrint || (() => window.print())}>Print / PDF</Button>
            </div>
        </div>
    );
}
