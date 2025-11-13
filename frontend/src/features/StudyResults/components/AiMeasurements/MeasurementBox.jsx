import React from "react";

export default function MeasurementBox({ item }) {
  const { label, value, discrepancy, color } = item;

  // ----------------------------------------
  // PART 1 — Color Theming (matching AiVideoMeasurementsBox)
  // ----------------------------------------
  const colorTheme = (() => {
    switch (color) {
      case "green":
        return {
          bg: "from-green-500/10 via-green-400/5 to-emerald-500/10",
          border: "border-green-300/40",
          text: "text-green-700",
          bar: "bg-green-400/70"
        };
      case "yellow":
        return {
          bg: "from-yellow-400/10 via-yellow-300/10 to-amber-400/10",
          border: "border-yellow-300/40",
          text: "text-yellow-700",
          bar: "bg-yellow-400/70"
        };
      case "red":
        return {
          bg: "from-red-500/10 via-red-400/10 to-orange-500/10",
          border: "border-red-300/40",
          text: "text-red-700",
          bar: "bg-red-400/70"
        };
      default:
        return {
          bg: "from-white/80 via-white/60 to-purple-50/10",
          border: "border-white/40",
          text: "text-gray-800",
          bar: "bg-purple-400/60"
        };
    }
  })();

  const { bg, border, text, bar } = colorTheme;

  // ----------------------------------------
  // PART 2 — Determine if value has probabilities
  // ----------------------------------------
  const isProbObject =
    value &&
    typeof value === "object" &&
    value.probs &&
    typeof value.probs === "object";

  return (
    <div
      className={`
        group p-5 rounded-3xl 
        bg-gradient-to-br ${bg} 
        backdrop-blur-md border ${border}
        shadow-md hover:shadow-xl hover:scale-[1.02]
        transition-transform transition-shadow duration-300
        w-60
      `}
    >
      {/* Label */}
      <div className="text-sm font-semibold text-gray-700 tracking-wide text-center truncate">
        {label}
      </div>

      {/* ----------------------------------------
          VALUE RENDERING
         ---------------------------------------- */}
      {isProbObject ? (
        <div className="mt-4 text-center">
          {/* Integrated label */}
          <div className={`text-xl font-semibold ${text}`}>
            {value.integrated_label}
          </div>

          {/* ----------------------------------------
              STYLED PROBABILITY TABLE (NEW)
             ---------------------------------------- */}
          <div
            className="
              mt-4 bg-white/60 backdrop-blur-sm 
              border border-gray-200/40 
              rounded-2xl p-4 shadow-md space-y-3
            "
          >
            {Object.entries(value.probs).map(([k, v]) => (
              <div
                key={k}
                className="
                  group/prob flex flex-col p-3 
                  bg-gradient-to-br from-white/70 to-gray-50 
                  rounded-xl border border-gray-200/40
                  shadow-sm transition-all duration-200
                  hover:shadow-md hover:scale-[1.015]
                "
              >
                {/* Row header */}
                <div className="flex justify-between text-gray-700 text-sm font-semibold">
                  <span>{k}</span>
                  <span>{(v * 100).toFixed(1)}%</span>
                </div>

                {/* Confidence Bar */}
                <div className="w-full h-2 bg-gray-200/50 rounded-full mt-2 overflow-hidden">
                  <div
                    style={{ width: `${v * 100}%` }}
                    className={`h-full ${bar} rounded-full transition-all`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* CASE: Simple numeric or label */
        <div className="mt-5 text-center">
          <span className={`text-3xl font-bold ${text}`}>{value}</span>
        </div>
      )}

      {/* ----------------------------------------
          DISCREPANCY BADGE
         ---------------------------------------- */}
      {discrepancy && (
        <div
          className="
            mt-4 text-xs font-semibold 
            px-3 py-1 rounded-xl 
            bg-gradient-to-br from-red-500/10 to-orange-500/10 
            border border-red-300/40 
            text-red-700 shadow-sm
          "
        >
          ⚠ Discrepancy
        </div>
      )}
    </div>
  );
}
