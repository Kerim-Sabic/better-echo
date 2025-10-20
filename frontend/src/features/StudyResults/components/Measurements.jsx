import React, { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { MEASUREMENT_DESCRIPTIONS, MEASUREMENT_UNITS, CLASS_NAMES } from "../../constants/MeasurementsConstants";
import { Loader2 } from "lucide-react";

const Measurements = ({ derivedResults }) => {
  if (!derivedResults) {
    return (
      <Card className="card-clinical">
        <CardHeader>
          <CardTitle>Measurements</CardTitle>
          <CardDescription>AI-calculated cardiac parameters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Calculating Measurements...
          </div>
        </CardContent>
      </Card>
    );
  }

  const measurements = derivedResults || null;

  if (!measurements) {
      return (
        <Card className="card-clinical">
          <CardHeader>
            <CardTitle>Measurements</CardTitle>
            <CardDescription>AI-calculated cardiac parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No measurements available</p>
          </CardContent>
        </Card>
      );
    }

    // --- Helper: graded certainty for binary outputs ---
    const getConfidenceLabel = (prob) => {
      if (prob < 0.1) return { label: "Very unlikely", color: "text-green-600" };
      if (prob < 0.3) return { label: "Unlikely", color: "text-green-500" };
      if (prob < 0.7) return { label: "Possible", color: "text-yellow-600" };
      if (prob < 0.9) return { label: "Likely", color: "text-red-500" };
      return { label: "Very likely / Certain", color: "text-red-600" };
    };

  return (
    <Card className="card-clinical">
      <CardHeader>
        <CardTitle>Measurements</CardTitle>
        <CardDescription>
          AI-calculated cardiac parameters (PanEcho)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm text-foreground">
          {Object.entries(measurements).map(([key, value]) => {
            const desc = MEASUREMENT_DESCRIPTIONS[key] || "";
            const unit = MEASUREMENT_UNITS[key] || "";
            const classNames = CLASS_NAMES[key];

            const isBinarySingleClass =
              Array.isArray(classNames) &&
              classNames.length === 1 &&
              typeof value === "number";

            return (
              <li key={key} className="pb-2 border-b">
                <div className="font-semibold">{key}</div>

                {/* --- Multi-class classification --- */}
                {Array.isArray(value) && classNames && classNames.length > 1 ? (
                  <div>
                    {(() => {
                      const maxIdx = value.indexOf(Math.max(...value));
                      const maxClass = classNames[maxIdx];
                      const maxProb = value[maxIdx];

                      return (
                        <div>
                          <span className="font-medium text-blue-600">
                            {maxClass} predicted
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            (probability {(maxProb * 100).toFixed(1)} %)
                          </span>

                          {/* Show all class probabilities */}
                          <ul className="mt-1 ml-3 text-xs list-disc text-muted-foreground">
                            {value.map((prob, idx) => (
                              <li key={idx}>
                                {classNames[idx]}: {(prob * 100).toFixed(1)} %
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                ) : isBinarySingleClass ? (
                  // --- Binary classification with one label ---
                  <div>
                    {(() => {
                      const { label, color } = getConfidenceLabel(value);
                      return (
                        <span className={`font-medium ${color}`}>
                          {classNames[0]} ({label} – probability{" "}
                          {(value * 100).toFixed(1)} %)
                        </span>
                      );
                    })()}
                  </div>
                ) : (
                  // --- Numeric regression values (default) ---
                  <div>
                    {typeof value === "number" ? value.toFixed(2) : value}{" "}
                    {unit && (
                      <span className="text-muted-foreground">{unit}</span>
                    )}
                  </div>
                )}

                {desc && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {desc}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

export default Measurements;
