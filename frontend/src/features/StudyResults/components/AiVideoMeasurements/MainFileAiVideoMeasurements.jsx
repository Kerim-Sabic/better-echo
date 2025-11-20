import React from "react";
import AiVideoMeasurementsList from "./AiVideoMeasurementsList";
import LoadingScreen from "../LoadingScreen";

export default function MainFileAiVideoMeasurements({ state, dynamicMeasurementsResults }) {

    if (state !== "ready") {
        return <LoadingScreen state={state} />;
    }

    const instances = dynamicMeasurementsResults?.instances || [];

    if (!Array.isArray(instances) || instances.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-6">
                <div className="relative">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/20">
                        <svg
                            className="w-12 h-12 text-gray-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <defs>
                                <linearGradient id="videoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#9333EA" />
                                    <stop offset="100%" stopColor="#06B6D4" />
                                </linearGradient>
                            </defs>
                            <rect
                                x="2"
                                y="6"
                                width="20"
                                height="12"
                                rx="2"
                                stroke="url(#videoGradient)"
                                strokeWidth="2"
                                fill="none"
                            />
                            <path
                                d="M16 12L9 8v8l7-4z"
                                fill="url(#videoGradient)"
                                opacity="0.6"
                            />
                        </svg>
                    </div>
                </div>
                <div className="text-center space-y-2 max-w-xs">
                    <p className="text-base font-semibold text-gray-800 tracking-tight">No Measurements</p>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                        No AI Video measurements available
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header Section */}
            <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-sm">
                    <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <defs>
                            <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#9333EA" />
                                <stop offset="100%" stopColor="#06B6D4" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                            fill="url(#headerGradient)"
                        />
                    </svg>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-800 tracking-tight">AI Video Analysis</h2>
                    <p className="text-xs text-gray-500 font-medium">{instances.length} dicom file{instances.length !== 1 ? "s" : ""} analyzed</p>
                </div>
            </div>

            {/* Measurements List */}
            <div className="space-y-5">
                {instances.map((instance, index) => (
                    <AiVideoMeasurementsList key={index} instance={instance} />
                ))}
            </div>
        </div>
    );
}
