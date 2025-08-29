import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Activity } from "lucide-react";
import { Button } from "../components/ui/button";
import { listStudiesApi } from "../api/StudiesApi";

import StudyHeader from "../features/StudyResults/StudyHeader";
import EchocardiogramViewerSection from "../features/StudyResults/EchocardiogramViewer";
import EFMeasurement from "../features/StudyResults/EFMeasurment";
import Measurements from "../features/StudyResults/Measurements";
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

  const fetchStudy = async () => {
    const list = await listStudiesApi();
    let found =
      list.find((s) => s.study_uid === id) || list.find((s) => String(s.id) === String(id));
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
          <p className="text-muted-foreground">Check the URL or return to the dashboard.</p>
          <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <StudyHeader
        study={study}
        loading={loading}
        polling={polling}
        onBack={() => navigate("/dashboard")}
        onRefresh={refreshNow}
        onGenerateReport={handleGenerateReport}
      />

      <main className="container grid grid-cols-1 gap-6 px-6 py-6 mx-auto print:block">
        <EchocardiogramViewerSection
          studyUID={studyUID}
          instanceId={instanceId}
          showSeg={showSeg}
          setShowSeg={setShowSeg}
        />

        <EFMeasurement studyUID={studyUID} instanceId={instanceId} />
        <Measurements studyUID={studyUID} />
        <Report studyUID={studyUID} />
      </main>
    </div>
  );
}
