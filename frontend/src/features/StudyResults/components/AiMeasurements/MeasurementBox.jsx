import React from "react";

export default function MeasurementBox({
    item,
    isEditing,
    draftValue,
    draftLabel,
    error,
    onStartEdit,
    onStopEdit,
    onChangeValue,
    onChangeLabel,
    onClearOverride,
}) {
    const { label, value, discrepancy, color, units, isOverridden, editType, editOptions } = item;

    // ------------------------------------------------------------
    // PART 1 - Define ALL color themes first
    // ------------------------------------------------------------
    const colorThemes = {
        green: {
        bg: "from-green-500/10 via-green-400/5 to-emerald-500/10",
        border: "border-green-300/40",
        text: "text-green-700",
        bar: "bg-green-400/70",
        },
        yellow: {
        bg: "from-yellow-400/10 via-yellow-300/10 to-amber-400/10",
        border: "border-yellow-300/40",
        text: "text-yellow-700",
        bar: "bg-yellow-400/70",
        },
        red: {
        bg: "from-red-500/10 via-red-400/10 to-orange-500/10",
        border: "border-red-300/40",
        text: "text-red-700",
        bar: "bg-red-400/70",
        },
        default: {
        bg: "from-white/80 via-white/60 to-purple-50/10",
        border: "border-white/40",
        text: "text-gray-800",
        bar: "bg-purple-400/60",
        },
    };

    const colorTheme = colorThemes[color] || colorThemes.default;
    const { bg, border, text, bar } = colorTheme;
    const iconButtonClasses =
        "absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white/80 text-gray-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-700";
    const actionButtonClasses =
        "rounded-lg border border-gray-200 bg-white/90 px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-white";
    const primaryButtonClasses =
        "rounded-lg border border-gray-900 bg-gray-900 px-2 py-1 text-xs text-white shadow-sm transition hover:bg-gray-800";
    const overrideRingClass = isOverridden
        ? "ring-2 ring-emerald-300/70 ring-offset-2 ring-offset-white/70"
        : "";

    // ------------------------------------------------------------
    // PART 2 - Identify classification tasks
    // ------------------------------------------------------------
    const isProbObject =
        value &&
        typeof value === "object" &&
        value.probs &&
        typeof value.probs === "object";

    // ------------------------------------------------------------
    // PART 3 - Detect unavailable measurement
    // ------------------------------------------------------------
    const isMissing =
        value === null ||
        value === undefined ||
        value === "" ||
        (typeof value === "number" && isNaN(value));

    return (
        <div
        className={`
            group relative p-5 rounded-3xl 
            bg-gradient-to-br ${bg}
            backdrop-blur-md border ${border}
            shadow-md hover:shadow-xl hover:scale-[1.02]
            transition-all duration-300
            w-full max-w-[260px]
            ${overrideRingClass}
        `}
        >
        {onStartEdit && (
            <button
                className={iconButtonClasses}
                onClick={onStartEdit}
                type="button"
                aria-label="Edit"
                title="Edit"
            >
                <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
            </button>
        )}

        {/* Label (up to 2 lines with ellipsis; full text on hover) */}
        <div
            className="text-sm font-semibold text-gray-800 tracking-wide text-center"
            title={label}
            style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            }}
        >
            {label}
        </div>

        {/* ------------------------------------------------------------
            CASE 1 - VALUE NOT AVAILABLE
            ------------------------------------------------------------ */}
        {isEditing ? (
            <div className="mt-4 space-y-2 text-center">
                {editType === "label" ? (
                    <select
                        className="w-full rounded-lg border px-2 py-1 text-sm text-gray-800"
                        value={draftLabel ?? ""}
                        onChange={(e) => onChangeLabel?.(e.target.value)}
                    >
                        <option value="">Select label</option>
                        {(editOptions || []).map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                ) : (
                    <div className="flex items-center justify-center gap-2">
                        <input
                            className="w-28 rounded-lg border px-2 py-1 text-center text-sm text-gray-800"
                            value={draftValue ?? ""}
                            onChange={(e) => onChangeValue?.(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    onStopEdit?.();
                                }
                            }}
                        />
                        {units && <span className="text-xs text-gray-500">{units}</span>}
                    </div>
                )}
                {editType !== "label" && (
                    <div className="text-[11px] text-gray-500">Units auto-applied</div>
                )}
                {error && <div className="text-xs text-red-600">{error}</div>}
                <div className="flex items-center justify-center gap-2">
                    <button
                        className={primaryButtonClasses}
                        onClick={onStopEdit}
                        type="button"
                    >
                        Done
                    </button>
                    {isOverridden && (
                        <button
                            className={actionButtonClasses}
                            onClick={onClearOverride}
                            type="button"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>
        ) : isMissing ? (
            <div className="mt-4 text-center">
            <div className="text-sm italic text-gray-500">
                This measurement is not available for this study.
            </div>
            </div>
        ) : isProbObject ? (
            /* ------------------------------------------------------------
                CASE 2 - CLASSIFICATION (with probabilities)
            ------------------------------------------------------------ */
            <div className="mt-3 text-center">
            <div className={`text-lg font-semibold ${text}`}>
                {value.integrated_label}
            </div>

            <div
                className="
                mt-3 bg-white/60 backdrop-blur-sm 
                border border-gray-200/40 
                rounded-2xl p-3 shadow-sm
                space-y-2
                "
            >
                {Object.entries(value.probs).map(([k, v]) => (
                <div
                    key={k}
                    className="
                    flex flex-col p-2 
                    bg-white/70 rounded-xl 
                    border border-gray-200/40
                    shadow-sm
                    "
                >
                    <div className="flex justify-between text-xs font-semibold text-gray-700">
                    <span>{k}</span>
                    <span>{(v * 100).toFixed(1)}%</span>
                    </div>

                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
                    <div
                        style={{ width: `${v * 100}%` }}
                        className={`h-full ${bar} rounded-full`}
                    />
                    </div>
                </div>
                ))}
            </div>
            </div>
        ) : (
            /* ------------------------------------------------------------
                CASE 3 - NUMERIC OR SIMPLE LABEL
            ------------------------------------------------------------ */
            <div className="mt-5 text-center">
            <span className={`text-3xl font-bold ${text}`}>{value}</span>
            </div>
        )}

        {/* Discrepancy badge */}
        {discrepancy && (
            <div
            className="
                mt-3 text-xs font-semibold 
                px-3 py-1 rounded-xl 
                bg-gradient-to-br from-red-500/10 to-orange-500/10 
                border border-red-300/40 
                text-red-700 shadow-sm
                text-center
            "
            title={"AI is unsure: two model estimates differ significantly (wide range). Please review."}
            aria-label="Discrepancy information"
            >
            ⚠ Discrepancy
            </div>
        )}
        </div>
    );
}

