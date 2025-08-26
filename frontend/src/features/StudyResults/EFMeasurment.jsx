import React, { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { inferEfApi } from "../../api/InferenceApi";
import { listDerivedResultsApi } from "../../api/StudiesApi";
import { Loader2, AlertCircle } from "lucide-react";

// Gauge widget for EF display
function EfGauge({ value, loading, error }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center">
        <Loader2 className="w-5 h-5 mb-2 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Computing EF…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center text-red-500">
        <AlertCircle className="w-5 h-5 mb-2" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (typeof value !== "number") {
    return <span className="text-sm text-muted-foreground">—</span>;
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

const EFMeasurement = ({ studyUID, instanceId }) => {
  const [ef, setEf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!studyUID && !instanceId) return;
    let timer;

    const fetchEf = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. Check if EF already exists in DerivedResult
        const results = await listDerivedResultsApi(studyUID);
        const efRow = results.find((r) => r.type === "EF");

        if (efRow && efRow.value_numeric !== null) {
          setEf(efRow.value_numeric);
          setLoading(false);
          return;
        }

        // 2. Trigger inference once if not started
        if (!startedRef.current) {
          startedRef.current = true;
          try {
            await inferEfApi({ study_uid: studyUID, instance_id: instanceId });
          } catch (err) {
            console.error("[EFMeasurement] EF inference failed:", err);
          }
        }

        // 3. Poll until EF row appears
        timer = setInterval(async () => {
          const updated = await listDerivedResultsApi(studyUID);
          const row = updated.find((r) => r.type === "EF");
          if (row && row.value_numeric !== null) {
            clearInterval(timer);
            setEf(row.value_numeric);
            setLoading(false);
          }
        }, 3000);
      } catch (err) {
        console.error("[EFMeasurement] Failed to fetch EF:", err);
        setError("Failed to fetch EF");
        setLoading(false);
      }
    };

    fetchEf();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [studyUID, instanceId]);

  return (
    <Card className="card-clinical">
      <CardHeader>
        <CardTitle>Ejection Fraction</CardTitle>
        <CardDescription>AI-estimated EF</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-4">
          <EfGauge value={ef} loading={loading} error={error} />
        </div>

        {!loading && !error && typeof ef === "number" && (
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
