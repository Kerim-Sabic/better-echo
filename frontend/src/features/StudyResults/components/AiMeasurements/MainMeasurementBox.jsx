import React from "react";

export default function MainMeasurementBox({
    mainMeasurement,
    isEditing,
    draftValue,
    error,
    onStartEdit,
    onStopEdit,
    onChangeValue,
    onClearOverride,
}) {
    if (!mainMeasurement) return null;

    const { label, value, discrepancy, color, units, isOverridden } = mainMeasurement;

    // Color themes (aligned with MeasurementBox)
    const colorThemes = {
        green: {
        bg: "from-green-500/10 via-green-400/5 to-emerald-500/10",
        border: "border-green-300/40",
        text: "text-green-700",
        },
        yellow: {
        bg: "from-yellow-400/10 via-yellow-300/10 to-amber-400/10",
        border: "border-yellow-300/40",
        text: "text-yellow-700",
        },
        red: {
        bg: "from-red-500/10 via-red-400/10 to-orange-500/10",
        border: "border-red-300/40",
        text: "text-red-700",
        },
        default: {
        bg: "from-white/80 via-white/60 to-purple-50/10",
        border: "border-white/40",
        text: "text-gray-800",
        },
  };

  const theme = colorThemes[color] || colorThemes.default;

  return (
        <div
        className={`
            group relative p-5 rounded-3xl 
            bg-gradient-to-br ${theme.bg}
            backdrop-blur-md border ${theme.border}
            shadow-md hover:shadow-xl hover:scale-[1.02]
            transition-all duration-300
            w-full max-w-[220px]
            flex flex-col items-center text-center
        `}
        >
        {onStartEdit && (
            <button
                className="absolute right-3 top-3 rounded-full border bg-white/80 px-2 py-0.5 text-xs text-gray-500 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={onStartEdit}
                type="button"
            >
                Edit
            </button>
        )}

        {isOverridden && (
            <div className="absolute left-3 top-3 rounded-full border bg-white/80 px-2 py-0.5 text-[10px] text-gray-600">
                Edited
            </div>
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

        {isEditing ? (
            <div className="mt-3 w-full space-y-2">
                <div className="flex items-center justify-center gap-2">
                    <input
                        className="w-24 rounded-lg border px-2 py-1 text-center text-sm text-gray-800"
                        value={draftValue}
                        onChange={(e) => onChangeValue?.(e.target.value)}
                    />
                    {units && (
                        <span className="text-xs text-gray-500">{units}</span>
                    )}
                </div>
                <div className="text-[11px] text-gray-500">Units auto-applied</div>
                {error && <div className="text-xs text-red-600">{error}</div>}
                <div className="flex items-center justify-center gap-2">
                    <button
                        className="rounded-lg border px-2 py-1 text-xs text-gray-600"
                        onClick={onStopEdit}
                        type="button"
                    >
                        Done
                    </button>
                    {isOverridden && (
                        <button
                            className="rounded-lg border px-2 py-1 text-xs text-gray-600"
                            onClick={onClearOverride}
                            type="button"
                        >
                            Reset to AI
                        </button>
                    )}
                </div>
            </div>
        ) : (
            <div className={`mt-3 text-3xl font-bold ${theme.text}`}>
                {value}
            </div>
        )}

        {/* Discrepancy (centered with tooltip) */}
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

