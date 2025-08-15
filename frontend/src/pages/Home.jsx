import React, { useState, useCallback } from "react";
import UploadForm from "../components/UploadForm";
import Viewer from "../components/Viewer";
import ResultPanel from "../components/ResultPanel";
import logo from "../assets/horalix_logo.png";
import "../App.css";

export default function Home() {
  const [studyUID, setStudyUID] = useState(null);
  const [instanceId, setInstanceId] = useState(null);
  const [ef, setEf] = useState(null);
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const handleUploaded = useCallback(({ study_uid, instance_id }) => {
    setStudyUID(study_uid || null);
    setInstanceId(instance_id || null);
  }, []);

  const handleEF = useCallback((valueOrNull) => {
    setEf(typeof valueOrNull === "number" ? valueOrNull : null);
  }, []);

  return (
    <div className="page">
      <header className="app-header border-b">
        <div className="container header-row">
          <div className="brand">
            {/* <div className="brand-icon" aria-hidden /> */}
            <img src={logo} alt="App Logo" className="brand-icon" />
            <h1 className="brand-title">Echocardiology Analyzer</h1>
          </div>
          <div className="status">{status}</div>
        </div>
      </header>

      <main className="container">
        {/* Row 1: Upload + EF Panel */}
        <div className="grid grid-2 gap-md">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Upload</div>
              <div className="card-subtitle">DICOM (.dcm)</div>
            </div>
            <div className="card-body">
              <UploadForm
                onStatus={setStatus}
                onUploading={setIsUploading}
                onUploaded={handleUploaded}
                onEF={handleEF}
              />
            </div>
          </div>

          <ResultPanel ef={ef} isBusy={isUploading} />
        </div>

        {/* Row 2: Full-width viewer */}
        {studyUID && (
          <div className="card viewer-card">
            <div className="card-header">
              <div className="card-title">Viewer</div>
              {instanceId && (
                <div className="badge monospace" title="Orthanc Instance ID">
                  {instanceId}
                </div>
              )}
            </div>
            <div className="card-body">
              <Viewer studyUID={studyUID} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
