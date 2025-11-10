import React from "react";

export default function MeasurementBox({ item }) {
  const { label, value, units, status, discrepancy, color } = item;

  // Determine text color (for discrepancy)
  const textColor = discrepancy ? "text-red-600" : "text-gray-800";

  // Determine base border color
  const baseBorder = discrepancy ? "border-red-300" : "border-blue-100";

  // Determine subtle background tint based on clinical color state
  const colorBg =
    color === "green"
      ? "bg-green-200 border-green-200"
      : color === "yellow"
      ? "bg-yellow-200 border-yellow-200"
      : color === "red"
      ? "bg-red-200 border-red-200"
      : "bg-white"; // default if no color

  return (
    <div
      className={`rounded-2xl shadow-md p-5 w-48 flex flex-col items-center justify-center border ${baseBorder} ${colorBg} transition-all duration-200 hover:shadow-lg hover:scale-[1.03]`}
    >
      {/* Label */}
      <div className="text-sm text-gray-500 font-medium tracking-wide text-center">
        {label}
      </div>

      {/* Main Value or Status */}
      {status ? (
        <div className={`mt-2 text-2xl font-semibold ${textColor} tracking-tight`}>
          {status}
        </div>
      ) : (
        <div className="mt-2 flex items-baseline space-x-1">
          <span className={`text-2xl font-semibold ${textColor}`}>{value}</span>
          {units && <span className="text-sm text-gray-400">{units}</span>}
        </div>
      )}

      {/* Discrepancy badge */}
      {discrepancy && (
        <div className="mt-2 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
          ⚠ Discrepancy
        </div>
      )}
    </div>
  );
}
