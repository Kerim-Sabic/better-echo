// src/pages/Results.jsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Viewer from "../components/Viewer";
import ResultPanel from "../components/ResultPanel";

export default function Results() {
    const navigate = useNavigate();
    const { state } = useLocation() || {};
    const { study, study_uid, instance_id, ef } = state || {};

    return (
        <div style={{ padding: 24, display: "grid", gap: 16 }}>
            <button onClick={() => navigate("/home")}>Back to Home</button>

            <ResultPanel
                study={study}
                ef={ef}
                studyUID={study_uid}
                instanceId={instance_id}
            />

            {/* Your OHIF/Orthanc viewer or embedded viewer */}
            <Viewer studyUID={study_uid || study?.studyUID} />
        </div>
    );
}
