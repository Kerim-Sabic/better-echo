// src/pages/StudyResults.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, FileDown, Eye, EyeOff } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import Viewer from "../components/Viewer";

function getStoredStudies() {
    try {
        const raw = localStorage.getItem("studies");
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}
function upsertStudy(updated) {
    const list = getStoredStudies();
    const idx = list.findIndex((s) => s.id === updated.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...updated };
    else list.unshift(updated);
    localStorage.setItem("studies", JSON.stringify(list));
}

export default function StudyResults() {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();

    const initialStudyFromState = location.state?.study;
    const [study, setStudy] = useState(() => {
        if (initialStudyFromState) return initialStudyFromState;
        const s = getStoredStudies().find((x) => x.id === id);
        return (
            s || {
                id,
                patientName: "Unknown",
                patientId: "—",
                dateOfBirth: "—",
                studyDate: new Date().toISOString().slice(0, 10),
                studyTime: new Date().toTimeString().slice(0, 5),
                status: "processing",
                findings: "—",
            }
        );
    });

    const instanceId = location.state?.instance_id || study.instance_id || null;
    const studyUID  = location.state?.study_uid  || study.study_uid  || null;

    const [showSeg, setShowSeg] = useState(true);
    const [ef, setEf] = useState(
        typeof study.ejectionFraction === "number" ? study.ejectionFraction : null
    );
    const [loadingEf, setLoadingEf] = useState(false);
    const [errorEf, setErrorEf] = useState("");

    const headerDate = useMemo(() => {
        try {
            return new Date(
                `${study.studyDate || ""}T${(study.studyTime || "00:00") + ":00"}`
            ).toLocaleDateString();
        } catch {
            return study.studyDate || "";
        }
    }, [study.studyDate, study.studyTime]);

    useEffect(() => {
        if (ef != null) return;
        if (!instanceId && !studyUID) return;

        (async () => {
            setLoadingEf(true);
            setErrorEf("");
            try {
                const params = studyUID ? { study_uid: studyUID } : { instance_id: instanceId };
                const res = await axios.get("http://localhost:8000/infer/ef", { params });
                const value = res?.data?.ef;
                if (typeof value === "number" && !Number.isNaN(value)) {
                    setEf(value);
                    const updated = { ...study, ejectionFraction: Math.round(value) };
                    setStudy(updated);
                    upsertStudy(updated);
                } else {
                    setErrorEf("EF not available");
                }
            } catch (e) {
                console.error(e);
                setErrorEf("EF inference failed");
            } finally {
                setLoadingEf(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceId, studyUID]);

    const handleGenerateReport = () => {
        window.print(); // quick “Save as PDF”. Swap to jsPDF/html2canvas later if you want a custom layout.
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Top Bar */}
            <header className="sticky top-0 z-10 border-b border-border bg-card/70 backdrop-blur">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Dashboard
                        </Button>

                        <div className="flex-1">
                            <h1 className="text-xl font-semibold text-foreground">
                                {study.patientName} <span className="text-muted-foreground">·</span>{" "}
                                <span className="text-muted-foreground">{study.patientId}</span>
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Study #{study.id} · {headerDate}
                            </p>
                        </div>

                        <Button className="btn-clinical" onClick={handleGenerateReport}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Generate Report
                        </Button>
                    </div>
                </div>
            </header>

            {/* Content (STACKED) */}
            <main className="container mx-auto px-6 py-6 grid grid-cols-1 gap-6 print:block">
                {/* Viewer full width */}
                <Card className="card-clinical overflow-hidden">
                    <div className="flex items-center justify-between px-6 pt-4">
                        <CardTitle className="text-lg">Echocardiogram Video</CardTitle>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowSeg((s) => !s)}
                            className="inline-flex items-center gap-2"
                        >
                            {showSeg ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            {showSeg ? "Hide Segmentation" : "Show Segmentation"}
                        </Button>
                    </div>
                    <CardContent className="p-0">
                        <div className="p-6">
                            {studyUID || instanceId ? (
                                <Viewer studyUID={studyUID} instanceId={instanceId} showSeg={showSeg} />
                            ) : (
                                <div className="aspect-video w-full rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                                    No study UID / instance ID
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* EF card (below viewer) */}
                <Card className="card-clinical">
                    <CardHeader>
                        <CardTitle>Ejection Fraction</CardTitle>
                        <CardDescription>AI-estimated EF</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center py-2">
                            <EfGauge value={ef} loading={loadingEf} error={errorEf} />
                        </div>
                        {typeof ef === "number" && (
                            <p className="text-center text-sm text-muted-foreground">
                                Status:{" "}
                                <span className="font-medium">
                  {ef >= 55 ? "Normal" : ef >= 40 ? "Mild" : "Reduced"}
                </span>
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Measurements card (below EF) */}
                <Card className="card-clinical">
                    <CardHeader>
                        <CardTitle>Measurements</CardTitle>
                        <CardDescription>AI-calculated chamber dimensions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="text-sm text-foreground space-y-2">
                            <li className="flex justify-between"><span>LVEDD</span><span className="text-muted-foreground">—</span></li>
                            <li className="flex justify-between"><span>LVESD</span><span className="text-muted-foreground">—</span></li>
                            <li className="flex justify-between"><span>IVS</span><span className="text-muted-foreground">—</span></li>
                            <li className="flex justify-between"><span>PW</span><span className="text-muted-foreground">—</span></li>
                            <li className="flex justify-between"><span>LA</span><span className="text-muted-foreground">—</span></li>
                            <li className="flex justify-between"><span>AO</span><span className="text-muted-foreground">—</span></li>
                        </ul>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}

function EfGauge({ value, loading, error }) {
    if (loading) return <span className="text-sm text-muted-foreground">Computing EF…</span>;
    if (error)   return <span className="text-sm text-destructive">{error}</span>;
    if (typeof value !== "number") return <span className="text-sm text-muted-foreground">—</span>;

    const pct = Math.max(0, Math.min(100, Math.round(value)));
    const hue = pct >= 55 ? 155 : pct >= 40 ? 40 : 0;
    const ring = `conic-gradient(hsl(${hue} 70% 45%) ${pct}%, #e5e7eb ${pct}% 100%)`;

    return (
        <div className="flex flex-col items-center">
            <div
                className="relative grid place-items-center"
                style={{ width: 140, height: 140, borderRadius: "50%", background: ring }}
            >
                <div className="absolute inset-3 rounded-full bg-white grid place-items-center shadow-inner">
                    <div className="text-3xl font-bold">{pct}%</div>
                </div>
            </div>
        </div>
    );
}
