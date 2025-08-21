// src/components/UploadForm.jsx
import React, { useState } from "react";
import axios from "axios";

export default function UploadForm({ onStatus, onUploading, onUploaded, onEF }) {
  const [file, setFile] = useState(null);

  const setStatus = (s) => onStatus && onStatus(s);
  const setBusy = (b) => onUploading && onUploading(b);

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setBusy(true);
    setStatus("Uploading...");

    try {
      // 1) upload
      const { data } = await axios.post("http://localhost:8000/upload-dicom", formData);
      const { study_uid, instance_id } = data || {};
      if (!study_uid || study_uid === "Unknown") {
        setStatus("Upload ok, but StudyInstanceUID missing.");
        setBusy(false);
        return;
      }
      setStatus("Uploaded. Running EF...");

      // 2) EF
      let efVal = null;
      try {
        const efRes = await axios.get("http://localhost:8000/infer/ef", {
          params: { study_uid },
        });
        const v = efRes?.data?.ef;
        if (typeof v === "number" && !Number.isNaN(v)) {
          efVal = v;
          onEF && onEF(v);
          setStatus(`Uploaded. EF: ${v.toFixed(1)}%`);
        } else {
          setStatus("Uploaded. EF not available.");
        }
      } catch (e) {
        setStatus("Uploaded. EF inference failed.");
      }

      // 3) Notify parent → will route to /results
      onUploaded && onUploaded({ study_uid, instance_id, ef: efVal });
    } catch (e) {
      console.error(e);
      setStatus("Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
      <div style={{ display: "grid", gap: 8 }}>
        <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
        <button onClick={handleUpload} disabled={!file}>
          Upload
        </button>
      </div>
  );
}
