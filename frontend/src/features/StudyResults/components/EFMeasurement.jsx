import React, { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Loader2 } from "lucide-react";

// Gauge widget for EF display
function EfGauge({ value }) {
  if (typeof value !== "number") {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const hue = pct >= 55 ? 155 : pct >= 40 ? 40 : 0;
  const ring = `conic-gradient(hsl(${hue} 70% 45%) ${pct}%, #e5e7eb ${pct}% 100%)`;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative grid place-items-center"
        style={{
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: ring,
        }}
      >
        <div className="absolute grid bg-white rounded-full shadow-inner inset-3 place-items-center">
          <div className="text-3xl font-bold">{pct}%</div>
        </div>
      </div>
    </div>
  );
}

const EFMeasurement = ({ derivedResults }) => {
  if (!derivedResults) {
    return (
      <Card className="card-clinical">
        <CardHeader>
          <CardTitle>Ejection Fraction</CardTitle>
          <CardDescription>AI-estimated EF</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Calculating Ejection Fraction...
          </div>
        </CardContent>
      </Card>
    );
  }

  const ef = derivedResults?.EF ?? null;

  return (
    <Card className="card-clinical">
      <CardHeader>
        <CardTitle>Ejection Fraction</CardTitle>
        <CardDescription>AI-estimated EF</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-4">
          <EfGauge value={ef} />
        </div>

        {typeof ef === "number" && (
          <p className="text-sm text-center text-muted-foreground">
            Status:{" "}
            <span className="font-medium">
              {ef >= 55 ? "Normal" : ef >= 40 ? "Mild" : "Reduced"}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default EFMeasurement;