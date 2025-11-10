import React from "react";

export default function MainMeasurementBox({ mainMeasurement }) {
  if (!mainMeasurement) return null;

  const { label, value, units, status, discrepancy, color} = mainMeasurement;

  return (
    <div className="bg-white shadow rounded-lg p-4 w-40 flex flex-col items-center justify-center border border-gray-200">
      <div className="text-sm text-gray-500">{label}</div>

      {status ? (
        <div className="mt-1 text-lg font-semibold text-gray-800">{status}</div>
      ) : (
        <div className="mt-1 text-lg font-semibold text-gray-800">
          {value} {units || ""}
        </div>
      )}

      {discrepancy && (
        <div className="mt-1 text-xs text-red-500 font-medium">Discrepancy</div>
      )}
    </div>
  );
}