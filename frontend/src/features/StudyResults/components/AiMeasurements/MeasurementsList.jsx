import React from "react";
import MeasurementBox from "./MeasurementBox";

export default function MeasurementsList({ section, items }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="p-6 rounded-3xl bg-gradient-to-br from-white via-white to-purple-50/30 
      backdrop-blur-sm shadow-lg border border-white/40">
      
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        {section}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <MeasurementBox key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}