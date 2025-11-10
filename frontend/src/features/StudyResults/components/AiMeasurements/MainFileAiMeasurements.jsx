import React from "react";
import { buildAiMeasurementsProps } from "./buildAiMeasurementsProps";
import MainMeasurementsList from "./MainMeasurementsList";
import MeasurementsList from "./MeasurementsList";

/**
 * Dumb UI entry. Accepts raw results, maps them via buildAiProps,
 * then renders presentational lists.
 *
 * Props:
 * - panechoEchoprimeResults: object (raw results)
 */
export default function MainFileAiMeasurements({ panechoEchoprimeResults }) {
  const { mainMeasurements, Measurements } = buildAiMeasurementsProps(panechoEchoprimeResults);
  console.log("MAIN MEASUREMENTS: ", mainMeasurements)
  console.log("MEASUREMENTS: ", Measurements)

  const hasMainMeasurements = Array.isArray(mainMeasurements) && mainMeasurements.length > 0;
  const hasMeasurements = Array.isArray(Measurements) && Measurements.length > 0;

  if (!hasMainMeasurements && !hasMeasurements) {
    return <div className="text-sm text-gray-600">No measurements available.</div>;
  }

  return (
    <div className="space-y-4">
      {hasMainMeasurements && <MainMeasurementsList mainMeasurements={mainMeasurements} />}

      {hasMeasurements &&
        Measurements.map((items) => (
          <MeasurementsList key={items.title} section={items.section} items={items.items || []} />
        ))}
    </div>
  );
}
