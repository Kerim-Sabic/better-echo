import React from "react";
import EchocardiogramViewer from "../components/EchocardiogramViewer";
import Header from "../components/Header";
import MainFileAiMeasurements from "../components/AiMeasurements/MainFileAiMeasurements";
import MainFileAiVideoMeasurements from "../components/AiVideoMeasurements/MainFileAiVideoMeasurements";
import MainFileLlmReport from "../components/LlmReport/MainFileLlmReport";
import { TITLEBAR_HEIGHT } from "../../../components/TitleBar";

export function StudyResultsLayout({ navigateBack, viewModel }) {
    const {
        studyUID,
        hasMeasurements,
        isPolling,
        refresh,
        patientName,
        patientSex,
        aiMeasurements = {},
        aiVideoMeasurements = {},
        llmReport = {},
        activeTab = "measurements",
        setActiveTab = () => {},
        anyLoading = false,
        onPrint,
    } = viewModel ?? {};

    if (!studyUID) {
        return (
            <div className="grid place-items-center min-h-screen text-sm text-gray-600">
                No study selected.
            </div>
        );
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
                        patientSex={patientSex}
                        hasMeasurements={hasMeasurements}
                        isPolling={isPolling}
                        onRefresh={refresh}
                        onPrint={onPrint}
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

                        <div className="ml-auto text-xs">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 bg-white/80 text-gray-600">
                                {anyLoading ? "Updating..." : "Ready"}
                            </span>
                        </div>
                    </div>

                    {/* Scrollable panel content */}
                    <div className="flex-1 overflow-y-auto mt-3 rounded-2xl border bg-white p-4">
                        {activeTab === "measurements" && (
                            <MainFileAiMeasurements
                                {...aiMeasurements}
                            />
                        )}
                        {activeTab === "segmentation" && (
                            <MainFileAiVideoMeasurements {...aiVideoMeasurements} />
                        )}
                        {activeTab === "report" && (
                            llmReport.state === undefined ? (
                                <div className="p-8 text-center text-sm text-gray-600">
                                    LLM reports are disabled in this build.
                                </div>
                            ) : (
                                <MainFileLlmReport {...llmReport} />
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
                "px-3 py-1.5 rounded-full text-sm border transition-colors",
                isActive
                    ? "bg-muted text-foreground border-border"
                    : "bg-card text-foreground border-border hover:bg-muted/60",
            ].join(" ")}
        >
            {children}
        </button>
    );
}
