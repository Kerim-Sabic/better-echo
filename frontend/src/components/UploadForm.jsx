import React, { useState } from "react";
import axios from "axios";

export default function UploadForm({
  onStatus,
  onUploading,
  onUploaded,
  onEF,
}) {
  const [file, setFile] = useState(null);
  const [localBusy, setLocalBusy] = useState(false);

  const setBusy = (b) => {
    setLocalBusy(b);
    onUploading?.(b);
  };

  const setStatus = (s) => onStatus?.(s);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);

    setBusy(true);
    setStatus("Uploading…");
    onEF?.(null);

    try {
      const { data } = await axios.post(
        "http://localhost:8000/upload-dicom",
        formData
      );
      const { study_uid, instance_id } = data || {};
      if (!study_uid || study_uid === "Unknown") {
        setStatus("Upload OK, but StudyInstanceUID missing.");
        setBusy(false);
        return;
      }

      onUploaded?.({ study_uid, instance_id });
      setStatus("Uploaded successfully! Running EF…");

      try {
        const efRes = await axios.get("http://localhost:8000/infer/ef", {
          params: study_uid ? { study_uid } : { instance_id },
        });
        const val = efRes?.data?.ef;
        if (typeof val === "number") {
          onEF?.(val);
          setStatus(`Uploaded. EF: ${val.toFixed(1)}%`);
        } else {
          onEF?.(null);
          setStatus("Uploaded. EF not available.");
        }
      } catch {
        onEF?.(null);
        setStatus("Uploaded. EF inference failed.");
      }
    } catch (e) {
      console.error(e);
      setStatus("Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uploader large-uploader">
      <label className={`dropzone big-dropzone ${file ? "has-file" : ""}`}>
        <input
          type="file"
          accept=".dcm,application/dicom"
          onChange={(e) => setFile(e.target.files[0] || null)}
          hidden
        />
        <div className="dz-body big-dz-body">
          <div className="dz-icon large-icon" aria-hidden />
          <div className="dz-text">
            <div className="dz-title large-title">Drop a DICOM here</div>
            <div className="dz-sub large-sub">
              …or click to browse your files
            </div>
          </div>
          {file && <div className="dz-file monospace">{file.name}</div>}
        </div>
      </label>

      <div className="actions">
        <button
          className="btn"
          onClick={handleUpload}
          disabled={!file || localBusy}
        >
          {localBusy ? "Uploading…" : "Upload & Analyze EF"}
        </button>
        {file && (
          <button
            className="btn ghost"
            onClick={() => {
              setFile(null);
              onEF?.(null);
              onStatus?.("");
            }}
            disabled={localBusy}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
