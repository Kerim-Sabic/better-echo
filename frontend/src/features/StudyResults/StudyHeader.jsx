import React, { useMemo } from "react";
import { ArrowLeft, FileDown, RefreshCcw } from "lucide-react";
import { Button } from "../../components/ui/button";

const StudyHeader = ({ study, loading, polling, onBack, onRefresh, onGenerateReport }) => {
    const headerDate = useMemo(() => {
        if (!study) return "-";
        if (study.study_date && study.study_date.length === 8) {
            const d = study.study_date;
            return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        }
        try {
            const date = `${study?.studyDate || ""}T${(study?.studyTime || "00:00") + ":00"}`;
            return new Date(date).toLocaleDateString();
        } catch {
            return "-";
        }
    }, [study]);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/70 backdrop-blur">
      <div className="container px-6 py-4 mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <h1 className="text-xl font-semibold text-foreground">
            {study?.patient.patient_name || "Unknown"}{" "}
            <span className="text-muted-foreground">·</span>{" "}
            <span className="text-muted-foreground">
              UID: {study?.study_uid || "—"}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">Date: {study?.study_date ? headerDate : "—"}</p>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCcw className={`mr-2 h-4 w-4 ${polling ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button className="btn-clinical" onClick={onGenerateReport}>
              <FileDown className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default StudyHeader;
