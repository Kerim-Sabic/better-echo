import React, { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { inferPanEchoApi } from "../../api/InferenceApi";
import { listDerivedResultsApi } from "../../api/StudiesApi"
import { Loader2, AlertCircle } from "lucide-react";

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
                    <ul className="space-y-2 text-sm text-foreground">
                        {Object.entries(measurements).map(([key, value]) => (
                            <li key={key} className="flex justify-between">
                                <span>{key}</span>
                                <span className="text-muted-foreground">
                                    {Array.isArray(value) ? value.join(", ") : value.toFixed ? value.toFixed(2) : value}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
};

export default Measurements;
