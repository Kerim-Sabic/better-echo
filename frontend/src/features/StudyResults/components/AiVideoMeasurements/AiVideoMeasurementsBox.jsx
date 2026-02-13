import React, { useRef, useState } from "react";

export default function AiVideoMeasurementsBox({ result }) {
    const { ui_label, output_path, status, message } = result;
    const MEDIA_BASE_URL = process.env.REACT_APP_API_URL_UPLOADS;

    const videoRef = useRef(null);
    const [isPaused, setIsPaused] = useState(false);

    const handleTogglePlay = () => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
            setIsPaused(false);
        } else {
            video.pause();
            setIsPaused(true);
        }
    };

    const getStatusStyle = () => {
        switch (status) {
            case "DONE":
                return {
                    bgColor: "bg-green-50",
                    textColor: "text-green-600",
                    borderColor: "border-green-200/50",
                    icon: (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M20 6L9 17l-5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    ),
                };
            case "SKIPPED":
                return {
                    bgColor: "bg-gray-100",
                    textColor: "text-gray-600",
                    borderColor: "border-gray-200/50",
                    icon: (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M13 17l5-5-5-5M6 17l5-5-5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    ),
                };
            default:
                return {
                    bgColor: "bg-accent-soft",
                    textColor: "text-blue-600",
                    borderColor: "border-blue-200/50",
                    icon: (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    ),
                };
        }
    };

    const statusStyle = getStatusStyle();

    return (
        <div className="group relative p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-border shadow-md">
            {/* Header */}
            <div className="flex items-start justify-between mb-4 gap-3">
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-800 tracking-tight truncate">
                        {ui_label || "Unnamed Measurement"}
                    </h3>
                </div>

                {/* Status Badge */}
                <div
                    className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl ${statusStyle.bgColor} backdrop-blur-sm border ${statusStyle.borderColor} shadow-sm`}
                >
                    <span className={statusStyle.textColor}>{statusStyle.icon}</span>
                    <span
                        className={`text-xs font-semibold ${statusStyle.textColor} uppercase tracking-wide`}
                    >
                        {status}
                    </span>
                </div>
            </div>

            {/* Skipped State */}
            {status === "SKIPPED" && (
                <div className="flex items-center space-x-3 py-6 px-4 rounded-xl bg-gray-100 border border-gray-200/50">
                    <svg
                        className="w-10 h-10 text-gray-400 flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                    >
                        <path
                            d="M13 16h-1v-4h1m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0 1 0-18z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <p className="text-sm text-gray-600 font-medium italic leading-relaxed">
                        {message || "Analysis was skipped for this measurement"}
                    </p>
                </div>
            )}

            {/* Video Player */}
            {status === "DONE" && output_path && (
                <div
                    className="relative overflow-hidden rounded-xl border border-border shadow-md cursor-pointer group/video"
                    onClick={handleTogglePlay}
                >
                    <video
                        ref={videoRef}
                        loop
                        autoPlay
                        muted
                        playsInline
                        src={`${MEDIA_BASE_URL}/${output_path}`}
                        className="w-full h-auto"
                    />

                    {/* Hover-only corner status badge */}
                    <div
                        className={`absolute top-3 right-3 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/30 shadow-lg opacity-0 group-hover/video:opacity-100 transition-opacity duration-300 ${
                            isPaused
                                ? "bg-orange-50 text-orange-600 border-orange-200/50"
                                : "bg-green-50 text-green-600 border-green-200/50"
                        }`}
                    >
                        <span className="text-xs font-semibold flex items-center space-x-1.5">
                            <span
                                className={`w-2 h-2 rounded-full ${
                                    isPaused ? "bg-orange-400" : "bg-green-400"
                                } animate-pulse`}
                            />
                            <span>{isPaused ? "Paused" : "Playing"}</span>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
