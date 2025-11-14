// src/features/StudyResults/components/Header.jsx
import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { listStudiesApi } from "../../../api/StudiesApi";

export default function Header({
  navigateBack,
  studyUID,
  hasMeasurements,
  isPolling,
  onRefresh,
  onPrint,
}) {
  const [patientName, setPatientName] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (!studyUID) {
          if (!cancel) setPatientName(null);
          return;
        }
        const studies = await listStudiesApi();
        if (cancel) return;
        const match = Array.isArray(studies)
          ? studies.find((s) => s.study_uid === studyUID)
          : null;
        setPatientName(match?.patient?.patient_name || null);
      } catch (e) {
        if (!cancel) setPatientName(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [studyUID]);

  const statusChip = (() => {
    if (isPolling) {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-[#9333EA]/10 text-[#9333EA]">
          Processing
        </span>
      );
    }
    if (hasMeasurements) {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-[#06B6D4]/10 text-[#06B6D4]">
          Ready
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs rounded-full border border-border text-foreground">
        No Data
      </span>
    );
  })();

  return (
    <div className="w-full flex items-center justify-between gap-4">
      {/* Left section: Back + Logo + Title */}
      <div className="flex items-center gap-4 min-w-0">
        <Button
          variant="ghost"
          onClick={navigateBack}
          className="gap-2 hover:scale-105 hover:bg-primary/10 hover:text-primary fast-transition"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </Button>

        <img
          src="/horalix-taskbar-app-icon.png"
          alt="Horalix Logo"
          className="w-8 h-8"
          onLoad={() => {}}
          onError={() => {}}
        />

        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#9333EA] via-[#6366F1] to-[#06B6D4] truncate">
            Study Results
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            Patient: {patientName || "-"} - UID: {studyUID || "-"}
          </p>
        </div>
      </div>

      {/* Right actions */}
      <div className="hidden md:flex items-center gap-2 ml-auto">
        {statusChip}
        <Button variant="outline" onClick={onRefresh}>Refresh</Button>
        <Button variant="gradient" onClick={onPrint || (() => window.print())}>Print / PDF</Button>
      </div>
    </div>
  );
}
