import React from "react";
import MeasurementBox from "./MeasurementBox";


export default function MeasurementsList({ section, items }) {
  if (!items || !items.length === 0 ) return null;

  return (
    <div className="border border-gray-200 rounded-2xl p-4 shadow-sm bg-white space-y-3">
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{section}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((item) => (
          <MeasurementBox key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}
