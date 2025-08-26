import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileDown, Eye, EyeOff, RefreshCcw, Activity } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardTitle } from "../components/ui/card";
import Viewer from "../components/Viewer";
import { listStudiesApi } from "../api/StudiesApi";
import Measurements from "../features/StudyResults/Measurements";
import EFMeasurement from "../features/StudyResults/EFMeasurment";
import Report from "../features/StudyResults/Report";

export default function StudyResults() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();

  const initialStudyFromState = location.state?.study;
  const [study, setStudy] = useState(initialStudyFromState || null);
  const [loading, setLoading] = useState(!initialStudyFromState);
  const [polling, setPolling] = useState(false);

  const instanceId = location.state?.instance_id || study?.instance_id || null;
  const studyUID = location.state?.study_uid || study?.study_uid || null;

  const [showSeg, setShowSeg] = useState(true);

  const headerDate = useMemo(() => {
    if (!study) return "—";
    if (study.study_date && study.study_date.length === 8) {
      const d = study.study_date;
      return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    }
    try {
      const date = `${study?.studyDate || ""}T${(study?.studyTime || "00:00") + ":00"}`;
      return new Date(date).toLocaleDateString();
    } catch {
      return "—";
    }
  }, [study]);

  // Load a single study by :id (study_uid first, then database id)
  const fetchStudy = async () => {
    const list = await listStudiesApi();
    let found =
      list.find((s) => s.study_uid === id) ||
      list.find((s) => String(s.id) === String(id));
    if (!found && list.length === 1) found = list[0];
    setStudy(found || null);
    setLoading(false);
    return found;
  };

  useEffect(() => {
    (async () => {
      await fetchStudy();
    })();
  }, [id]);

  const refreshNow = async () => {
    setLoading(true);
    await fetchStudy();
  };

  const handleGenerateReport = () => {
    window.print();
  };

  if (loading && !study) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="w-10 h-10 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading study…</p>
        </div>
      </div>
    );
  }
  if (!study) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 text-center">
          <p className="text-lg font-semibold">Study not found</p>
          <p className="text-muted-foreground">
            Check the URL or return to the dashboard.
          </p>
          <Button onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/70 backdrop-blur">
        <div className="container px-6 py-4 mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>

            <h1 className="text-xl font-semibold text-foreground">
              {study.patient_id || "Unknown"}{" "}
              <span className="text-muted-foreground">·</span>{" "}
              <span className="text-muted-foreground">
                UID: {study.study_uid || "—"}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Date:{" "}
              {study.study_date
                ? `${study.study_date.slice(0, 4)}-${study.study_date.slice(
                    4,
                    6
                  )}-${study.study_date.slice(6, 8)}`
                : headerDate}
            </p>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={refreshNow}>
                <RefreshCcw
                  className={`mr-2 h-4 w-4 ${polling ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button className="btn-clinical" onClick={handleGenerateReport}>
                <FileDown className="w-4 h-4 mr-2" />
                Generate Report
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container grid grid-cols-1 gap-6 px-6 py-6 mx-auto print:block">
        {/* Viewer */}
        <Card className="overflow-hidden card-clinical">
          <div className="flex items-center justify-between px-6 pt-4">
            <CardTitle className="text-lg">Echocardiogram Video</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSeg((s) => !s)}
              className="inline-flex items-center gap-2"
            >
              {showSeg ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showSeg ? "Hide Segmentation" : "Show Segmentation"}
            </Button>
          </div>
          <CardContent className="p-0">
            <div className="p-6">
              {studyUID || instanceId ? (
                <Viewer
                  studyUID={studyUID}
                  instanceId={instanceId}
                  showSeg={showSeg}
                />
              ) : (
                <div className="flex items-center justify-center w-full rounded-md aspect-video bg-muted text-muted-foreground">
                  No study UID / instance ID
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* EF */}
        <EFMeasurement studyUID={studyUID} instanceId={instanceId} />

        {/* Measurements */}
        <Measurements studyUID={studyUID} />

        {/* Report */}
        <Report studyUID={studyUID}/>
      </main>
    </div>
  );
}
