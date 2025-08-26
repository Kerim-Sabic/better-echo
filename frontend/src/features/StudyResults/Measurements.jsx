import React, { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { inferPanEchoApi } from "../../api/InferenceApi";
import { listDerivedResultsApi } from "../../api/StudiesApi"
import { Loader2, AlertCircle } from "lucide-react";
import { MEASUREMENT_DESCRIPTIONS, MEASUREMENT_UNITS, CLASS_NAMES } from "../../constants/MeasurementsConstants";

const Measurements = ({ studyUID, instanceId }) => {
    const [measurements, setMeasurements] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const startedRef = useRef(false);

    useEffect(() => {
        if (!studyUID && !instanceId) return;
        let timer;

        const fetchMeasurements = async () => {
            setLoading(true);
            setError(null);
            try {
                // 1. Check if PanEcho results already exist in DerivedResult
                const results = await listDerivedResultsApi(studyUID);
                const panechoRow = results.find(r => r.type === "PanEcho_AllTasks");

                if (panechoRow && panechoRow.value_json) {
                    setMeasurements(JSON.parse(panechoRow.value_json));
                    setLoading(false);
                    return;
                }

                // 2. Trigger inference once if not started yet
                if (!startedRef.current) {
                    startedRef.current = true;
                    try {
                        await inferPanEchoApi({ study_uid: studyUID, instance_id: instanceId });
                    } catch (err) {
                        console.error("[Measurements] PanEcho inference failed:", err);
                    }
                }

                // 3. Poll until DerivedResult row is created
                timer = setInterval(async () => {
                    const updated = await listDerivedResultsApi(studyUID);
                    const row = updated.find(r => r.type === "PanEcho_AllTasks");
                    if (row && row.value_json) {
                        clearInterval(timer);
                        setMeasurements(JSON.parse(row.value_json));
                        setLoading(false);
                    }
                }, 3000);
                
            } catch (err) {
                console.error("[Measurements] Failed to fetch PanEcho results: ", err);
                setError("Failed to fetch measurements");
                setLoading(false);
            }
        };

        fetchMeasurements();

        return () => { if (timer) clearInterval(timer); };
    }, [studyUID, instanceId]);

    // Helper function for graded certainty
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
        <CardDescription>AI-calculated cardiac parameters (PanEcho)</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Fetching measurements...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center gap-2 py-6 text-red-500">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {!loading && !error && measurements && (
          <ul className="space-y-3 text-sm text-foreground">
            {Object.entries(measurements).map(([key, value]) => {
              const desc = MEASUREMENT_DESCRIPTIONS[key] || "";
              const unit = MEASUREMENT_UNITS[key] || "";
              const classNames = CLASS_NAMES[key];

              const isBinarySingleClass =
                Array.isArray(classNames) && classNames.length === 1 && typeof value === "number";

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

                            {/* Optional: show other probabilities */}
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
                      <div>
                        {(() => {
                          const { label, color } = getConfidenceLabel(value);
                          return (
                            <span className={`font-medium ${color}`}>
                              {classNames[0]} ({label} – probability {(value * 100).toFixed(1)} %) 
                            </span>
                          );
                        })()}
                      </div>
                    ) : (
                    // --- Numeric regression values ---
                    <div>
                      {typeof value === "number" ? value.toFixed(2) : value}{" "}
                      {unit && <span className="text-muted-foreground">{unit}</span>}
                    </div>
                  )}

                  {desc && <div className="mt-1 text-xs text-muted-foreground">{desc}</div>}
                </li>
              );
            })}

          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default Measurements;
