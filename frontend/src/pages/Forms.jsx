// src/pages/Forms.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import NewStudy from "../components/NewStudy";
import UploadForm from "../components/UploadForm";
import { TITLEBAR_HEIGHT } from "../components/TitleBar";

export default function Forms() {
    const navigate = useNavigate();
    const [status, setStatus] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const handleStudyCreated = (study) => {
        // go to results and carry the study object
        navigate("/results", { state: { study } });
    };

    const handleUploaded = ({ study_uid, instance_id, ef }) => {
        // go to results with identifiers & EF
        navigate("/results", { state: { study_uid, instance_id, ef } });
    };

    return (
        <div style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT})`, display: "grid", gap: 24, padding: 24 }}>
            <NewStudy
                onBack={() => navigate("/home")}
                onStudyCreated={handleStudyCreated}
            />

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                <h3>Upload DICOM</h3>
                <p style={{ color: "#6b7280" }}>{isUploading ? "Uploading…" : status}</p>
                <UploadForm
                    onStatus={setStatus}
                    onUploading={setIsUploading}
                    onUploaded={handleUploaded}
                    onEF={(v) => console.log("EF:", v)}
                />
            </div>
        </div>
    );
}
