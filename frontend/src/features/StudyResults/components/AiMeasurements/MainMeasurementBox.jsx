import React from "react";

export default function MainMeasurementBox({ mainMeasurement }) {
  if (!mainMeasurement) return null;

  const { label, value, discrepancy, color } = mainMeasurement;

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
        p-5 rounded-3xl 
        bg-gradient-to-br ${theme.bg}
        backdrop-blur-md border ${theme.border}
        shadow-md hover:shadow-xl hover:scale-[1.02]
        transition-all duration-300
        w-full max-w-[220px]
        flex flex-col items-center text-center
      `}
    >
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

      {/* Value ONLY (no units, no status) */}
      <div className={`mt-3 text-3xl font-bold ${theme.text}`}>
        {value}
      </div>

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

