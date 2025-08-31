import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity } from "lucide-react";
import { Button } from "../components/ui/button";
import StudyHeader from "../features/StudyResults/StudyHeader";
import EchocardiogramViewerSection from "../features/StudyResults/EchocardiogramViewer";
import EFMeasurement from "../features/StudyResults/EFMeasurement";
import Measurements from "../features/StudyResults/Measurements";
import Report from "../features/StudyResults/Report";
import { useStudyResults } from "../features/StudyResults/hooks/useStudyResults";

export default function StudyResults() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { study, studyUID, derivedResults, loading, polling, refresh } =
    useStudyResults(id);

  if (loading && !study) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="w-10 h-10 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">
            {polling ? "Running inference…" : "Loading study…"}
          </p>
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
        onRefresh={refresh}
        onGenerateReport={() => window.print()}
      />

      <main className="container grid grid-cols-1 gap-6 px-6 py-6 mx-auto print:block">
        <EchocardiogramViewerSection
          studyUID={studyUID}
          instanceId={study?.instance_id}
          showSeg={true}
          setShowSeg={() => {}}
        />

        <EFMeasurement derivedResults={derivedResults} />
        <Measurements derivedResults={derivedResults} />
        {/*<Report studyUID={studyUID} />*/}
      </main>
    </div>
  );
}
