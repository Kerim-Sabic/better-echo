import React, { useState } from "react";
import MeasurementBox from "./MeasurementBox";

export default function MeasurementsList({
    section,
    items,
    editingKey,
    draftOverrides,
    fieldErrors,
    onStartEdit,
    onStopEdit,
    onChangeValue,
    onChangeLabel,
    onClearOverride,
    savingKey,
}) {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!items || items.length === 0) return null;

    const totalMeasurements = items.length;
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
            {/* HEADER (click to expand/collapse) */}
            <div
                className="
          flex items-center justify-between mb-3
          cursor-pointer select-none
        "
                onClick={() => setIsExpanded(!isExpanded)}
            >
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

                    <div>
                        {/* Section title */}
                        <div className="flex items-center space-x-2">
                            <div className="text-lg font-semibold text-foreground tracking-tight">
                                {section}
                            </div>

                            {/* Chevron */}
                            <svg
                                className={`
                  w-4 h-4 text-gray-500 transform transition-transform duration-300
                  ${isExpanded ? "rotate-180" : ""}
                `}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Measurement count badge */}
                <div className="px-3 py-1.5 rounded-xl badge-accent-soft backdrop-blur-sm shadow-sm">
                    <span className="text-sm font-semibold text-accent-main">
                        {totalMeasurements} {totalMeasurements === 1 ? "measurement" : "measurements"}
                    </span>
                </div>
            </div>

            {/* COLLAPSIBLE CONTENT */}
            <div
                className={`
          transition-all duration-300
          ${isExpanded ? "opacity-100 max-h-[5000px] mt-5 overflow-visible" : "opacity-0 max-h-0 overflow-hidden"}
          pb-4
        `}
            >
                <div
                    className="
            grid gap-5
            grid-cols-[repeat(auto-fit,minmax(200px,max-content))]
            justify-center
          "
                >
                    {items.map((item) => (
                        <MeasurementBox
                            key={item.key}
                            item={item}
                            isEditing={editingKey === item.key}
                            draftValue={draftOverrides?.[item.key]?.value ?? ""}
                            draftLabel={draftOverrides?.[item.key]?.label ?? ""}
                            error={fieldErrors?.[item.key]}
                            onStartEdit={() => onStartEdit?.(item)}
                            onStopEdit={() => onStopEdit?.(item.key)}
                            onChangeValue={(val) => onChangeValue?.(item.key, val)}
                            onChangeLabel={(val) => onChangeLabel?.(item.key, val)}
                            onClearOverride={() => onClearOverride?.(item.key)}
                            isSaving={savingKey === item.key}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
