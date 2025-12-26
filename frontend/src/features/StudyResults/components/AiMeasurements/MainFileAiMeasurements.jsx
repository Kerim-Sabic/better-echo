import React from "react";
import MainMeasurementsList from "./MainMeasurementsList";
import MeasurementsList from "./MeasurementsList";
import LoadingScreen from "../LoadingScreen";

export default function MainFileAiMeasurements({
    state,
    showLoading,
    isEmpty,
    totalMeasurements,
    mainMeasurements,
    Measurements,
    hasMainMeasurements,
    hasMeasurements,
    editingKey,
    draftOverrides,
    fieldErrors,
    savingKey,
    onStartEdit,
    onStopEdit,
    onChangeValue,
    onChangeLabel,
    onClearOverride,
}) {
    if (showLoading) {
        return <LoadingScreen state={state} />;
    }

    if (isEmpty) {
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
                                <linearGradient id="measurementGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#9333EA" />
                                    <stop offset="100%" stopColor="#06B6D4" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                stroke="url(#measurementGradient)"
                                strokeWidth="2"
                            />
                        </svg>
                    </div>
                </div>
                <div className="text-center space-y-2 max-w-xs">
                    <p className="text-base font-semibold text-gray-800 tracking-tight">No Measurements</p>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                        No AI measurements available for this study.
                    </p>
                </div>
            </div>
        );
    }

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
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                            stroke="url(#headerGradient)"
                            strokeWidth="2"
                        />
                    </svg>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-gray-800 tracking-tight">
                        AI Measurements
                    </h2>
                    <p className="text-xs text-gray-500 font-medium">
                        {totalMeasurements} measurement{totalMeasurements !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>

            {/* Measurements Sections */}
            {hasMainMeasurements && (
                <MainMeasurementsList
                    mainMeasurements={mainMeasurements}
                    editingKey={editingKey}
                    draftOverrides={draftOverrides}
                    fieldErrors={fieldErrors}
                    onStartEdit={onStartEdit}
                    onStopEdit={onStopEdit}
                    onChangeValue={onChangeValue}
                    onClearOverride={onClearOverride}
                    savingKey={savingKey}
                />
            )}

            {hasMeasurements &&
                Measurements.map((items, idx) => (
                    <MeasurementsList
                        key={items.section || `section-${idx}`}
                        section={items.section}
                        items={items.items || []}
                        editingKey={editingKey}
                        draftOverrides={draftOverrides}
                        fieldErrors={fieldErrors}
                        onStartEdit={onStartEdit}
                        onStopEdit={onStopEdit}
                        onChangeValue={onChangeValue}
                        onChangeLabel={onChangeLabel}
                        onClearOverride={onClearOverride}
                        savingKey={savingKey}
                    />
                ))}
        </div>
    );
}
