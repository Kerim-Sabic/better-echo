import React from "react";
import MainMeasurementBox from "./MainMeasurementBox";

export default function MainMeasurementsList({
    mainMeasurements,
    editingKey,
    draftOverrides,
    fieldErrors,
    onStartEdit,
    onStopEdit,
    onChangeValue,
    onClearOverride,
    savingKey,
}) {
    if (!Array.isArray(mainMeasurements) || mainMeasurements.length === 0) {
        return null;
    }

    return (
        <div
            className="
        p-6 rounded-3xl
        bg-white backdrop-blur-sm
        shadow-lg border border-border
        transition-all duration-300
        hover:shadow-xl
      "
        >
            {/* HEADER - matches MeasurementsList style */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                    {/* Icon box */}
                    <div className="w-12 h-12 rounded-2xl icon-chip-accent backdrop-blur-sm flex items-center justify-center shadow-sm">
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"
                                fill="currentColor"
                                opacity="0.7"
                            />

                            <path
                                d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                            />
                        </svg>
                    </div>

                    {/* Section title */}
                    <div className="text-lg font-semibold text-foreground tracking-tight">
                        Key Measurements
                    </div>
                </div>

                {/* Optional: measurement count badge */}
                <div className="px-3 py-1.5 rounded-xl badge-accent-soft backdrop-blur-sm shadow-sm">
                    <span className="text-sm font-semibold text-accent-main">
                        {mainMeasurements.length} values
                    </span>
                </div>
            </div>

            {/* GRID OF MAIN MEASUREMENTS */}
            <div
                className="
          grid gap-5
          grid-cols-[repeat(auto-fit,minmax(200px,max-content))]
          justify-center
        "
            >
                {mainMeasurements.map((m) => (
                    <MainMeasurementBox
                        key={m.key}
                        mainMeasurement={m}
                        isEditing={editingKey === m.key}
                        draftValue={draftOverrides?.[m.key]?.value ?? ""}
                        error={fieldErrors?.[m.key]}
                        onStartEdit={() => onStartEdit?.(m)}
                        onStopEdit={() => onStopEdit?.(m.key)}
                        onChangeValue={(val) => onChangeValue?.(m.key, val)}
                        onClearOverride={() => onClearOverride?.(m.key)}
                        isSaving={savingKey === m.key}
                    />
                ))}
            </div>
        </div>
    );
}
