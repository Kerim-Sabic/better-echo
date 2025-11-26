import React, { useEffect, useState } from "react";
import EchocardiogramViewer from "../components/EchocardiogramViewer";
import Header from "../components/Header";
import MainFileAiMeasurements from "../components/AiMeasurements/MainFileAiMeasurements";
import MainFileAiVideoMeasurements from "../components/AiVideoMeasurements/MainFileAiVideoMeasurements";
import MainFileLlmReport from "../components/LlmReport/MainFileLlmReport";
import { TITLEBAR_HEIGHT } from "../../../components/TitleBar";
import { buildAiMeasurementsProps } from "../components/AiMeasurements/buildAiMeasurementsProps";
import { listStudiesApi } from "../../../api/StudiesApi";
import { printMeasurementsReport } from "../components/Report/printMeasurementsReport";
import { buildMeasurementsReportHtml } from "../components/Report/buildMeasurementsReportHtml";

export function StudyResultsLayout({ navigateBack, viewModel }) {
    const {
        panEchoEchoprimeState,
        dynamicMeasurementsState,
        llmReportState,

        studyUID,

        panechoEchoprimeResults,
        dynamicMeasurementsResults,
        llmReportResults,

        hasMeasurements,
        isPolling,
        refresh,
        patientName: providedPatientName,
    } = viewModel ?? {};

    const [activeTab, setActiveTab] = useState("measurements");
    const [patientName, setPatientName] = useState(providedPatientName || null);

    useEffect(() => {
        let cancel = false;
        if (!studyUID) {
            setPatientName(null);
            return () => { cancel = true; };
        }
        if (providedPatientName) {
            setPatientName(providedPatientName);
            return () => { cancel = true; };
        }
        (async () => {
            try {
                const studies = await listStudiesApi();
                if (cancel) return;
                const match = Array.isArray(studies) ? studies.find((s) => s.study_uid === studyUID) : null;
                setPatientName(match?.patient?.patient_name || null);
            } catch {
                if (!cancel) setPatientName(null);
            }
        })();
        return () => { cancel = true; };
    }, [studyUID, providedPatientName]);

    if (!studyUID) {
        return (
            <div className="grid place-items-center min-h-screen text-sm text-gray-600">
                No study selected.
            </div>
        );
    }

    const anyLoading =
        ["loading", "pending"].includes(panEchoEchoprimeState) ||
        ["loading", "pending"].includes(dynamicMeasurementsState) ||
        ["loading", "pending"].includes(llmReportState);

    async function toDataUrl(src) {
        try {
            const res = await fetch(src);
            if (!res.ok) throw new Error("fetch failed");
            const blob = await res.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch {
            return null;
        }
    }

    async function handlePrint() {
        try {
            const { mainMeasurements = [], Measurements = [] } = buildAiMeasurementsProps(
                panechoEchoprimeResults || null
            ) || {};

            const hasAny = (Array.isArray(mainMeasurements) && mainMeasurements.length > 0) ||
                (Array.isArray(Measurements) && Measurements.some((g) => (g.items || []).length > 0));
            if (!hasAny) {
                alert("No measurements to print.");
                return;
            }

            // Try Electron PDF preview if available
            const logoDataUrl = await toDataUrl("/horalix-taskbar-app-icon.png");
            const html = buildMeasurementsReportHtml({ logoDataUrl, patientName, studyUID, mainMeasurements, Measurements });
            const preview = window.electronAPI?.report?.previewPdf;
            if (typeof preview === "function") {
                const res = await preview(html, { printBackground: true, pageSize: "A4" });
                if (!res?.ok) {
                    console.warn("PDF preview failed", res?.error);
                    // fallback to browser print
                    printMeasurementsReport({ patientName, studyUID, mainMeasurements, Measurements });
                }
                return;
            }
            // fallback to browser print if no Electron API
            printMeasurementsReport({ patientName, studyUID, mainMeasurements, Measurements });
        } catch (e) {
            console.warn("Failed to prepare print", e);
        }
    }

    return (
        <div className="h-full flex flex-col bg-[#f8f8f8] overflow-hidden">

            {/* -------- Header -------- */}
            <header className="fixed left-0 right-0 z-50 bg-white/90 backdrop-blur border-b h-16" style={{ top: TITLEBAR_HEIGHT }}>
                <div className="h-full px-6 flex items-center">
                    <Header
                        navigateBack={navigateBack}
                        studyUID={studyUID}
                        patientName={patientName}
                        hasMeasurements={hasMeasurements}
                        isPolling={isPolling}
                        onRefresh={refresh}
                        onPrint={handlePrint}
                    />
                </div>
            </header>

            {/* -------- MAIN CONTENT AREA  -------- */}
            <div className="flex flex-1 pt-16 pb-14 overflow-hidden">

                {/* -------- LEFT VIEWER PANE -------- */}
                <section className="w-full lg:w-1/2 h-full overflow-auto p-6">
                    <EchocardiogramViewer studyUID={studyUID} />
                </section>

                {/* -------- RIGHT PANE -------- */}
                <section className="w-full lg:w-1/2 h-full flex flex-col overflow-y-auto p-6">

                    {/* Sticky tab bar inside right column */}
                    <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border rounded-xl px-3 py-2 flex items-center gap-2">
                        <Pill
                            isActive={activeTab === "measurements"}
                            onClick={() => setActiveTab("measurements")}
                        >
                            AI Measurements
                        </Pill>
                        <Pill
                            isActive={activeTab === "segmentation"}
                            onClick={() => setActiveTab("segmentation")}
                        >
                            AI Segmentations
                        </Pill>
                        <Pill
                            isActive={activeTab === "report"}
                            onClick={() => setActiveTab("report")}
                        >
                            AI Report
                        </Pill>

                        <div className="ml-auto text-xs text-gray-500">
                            {anyLoading ? "Updating..." : "Ready"}
                        </div>
                    </div>

                    {/* Scrollable panel content */}
                    <div className="flex-1 overflow-y-auto mt-3 rounded-2xl border bg-white p-4">
                        {activeTab === "measurements" && (
                            <MainFileAiMeasurements
                                state={panEchoEchoprimeState}
                                panechoEchoprimeResults={panechoEchoprimeResults}
                            />
                        )}
                        {activeTab === "segmentation" && (
                            <MainFileAiVideoMeasurements
                                state={dynamicMeasurementsState}
                                dynamicMeasurementsResults={dynamicMeasurementsResults}
                            />
                        )}
                        {activeTab === "report" && (
                            llmReportState === undefined ? (
                                <div className="p-8 text-center text-sm text-gray-600">
                                    LLM reports are disabled in this build.
                                </div>
                            ) : (
                                <MainFileLlmReport
                                    state={llmReportState}
                                    llmReportResults={llmReportResults}
                                />
                            )
                        )}
                    </div>

                </section>
            </div>

            {/* -------- FOOTER -------- */}
            <footer className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-t h-14">
                <div className="h-full px-6 flex items-center">
                    <div className="text-xs text-gray-500">
                        {anyLoading ? "Polling for results..." : "Ready"}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <button className="px-3 py-1.5 rounded-xl border bg-white text-gray-400 cursor-not-allowed" disabled>
                            Send to PACS
                        </button>
                        <button className="px-3 py-1.5 rounded-xl border bg-gray-200 text-gray-500 cursor-not-allowed" disabled>
                            Approve / Sign
                        </button>
                    </div>
                </div>
            </footer>

        </div>
    );
}


/* -------------------- helpers -------------------- */

function Pill({ isActive, onClick, children }) {
    return (
        <button
            onClick={onClick}
            role="tab"
            aria-selected={isActive}
            className={[
                "px-3 py-1.5 rounded-full text-sm border",
                isActive
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
            ].join(" ")}
        >
            {children}
        </button>
    );
}
