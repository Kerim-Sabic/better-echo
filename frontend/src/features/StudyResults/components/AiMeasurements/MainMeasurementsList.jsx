import React from "react";
import MainMeasurementBox from "./MainMeasurementBox";

export default function MainMeasurementsList( { mainMeasurements }) {
  if (!Array.isArray(mainMeasurements) || mainMeasurements.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4">
      {mainMeasurements.map((mainMeasurement) => (
        <MainMeasurementBox key={mainMeasurement.key} mainMeasurement={mainMeasurement} />
      ))}
    </div>
  );
}