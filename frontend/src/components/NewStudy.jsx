// src/pages/NewStudy.jsx
import React, { useState } from "react";
import { ArrowLeft, Calendar, User, Heart, Save, Upload } from "lucide-react"; // icons are optional
import UploadForm from "../components/UploadForm";

const NewStudy = ({ onBack = () => {}, onStudyCreated = () => {} }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ---- form state ----
    const [formData, setFormData] = useState({
        patientName: "",
        patientId: "",
        dateOfBirth: "",
        studyDate: new Date().toISOString().split("T")[0],
        studyTime: new Date().toTimeString().slice(0, 5),
        clinicalIndication: "",
        referringPhysician: "",
        priority: "routine",
    });

    // ---- upload state (from UploadForm) ----
    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState("");
    const [ef, setEf] = useState(null);
    const [uploadedMeta, setUploadedMeta] = useState(null); // { study_uid, instance_id, ef? }

    const handleInputChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const validateForm = () => {
        const required = ["patientName", "patientId", "dateOfBirth", "studyDate", "studyTime"];
        return required.every((f) => String(formData[f] || "").trim() !== "");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            alert("Please fill in all required fields.");
            return;
        }

        setIsSubmitting(true);
        try {
            // Generate a simple client-side ID
            const studyId = `ECH-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

            const newStudy = {
                id: studyId,
                ...formData,
                status: "pending",
                findings: "Awaiting analysis",
                createdAt: new Date().toISOString(),
                // include whatever we got from the uploader so parent can route to /results
                ...(uploadedMeta || {}), // adds study_uid, instance_id, ef (if present)
            };

            // (Optional) small delay to simulate saving
            await new Promise((r) => setTimeout(r, 400));

            onStudyCreated(newStudy);
        } catch (err) {
            console.error(err);
            alert("Failed to create new study. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ------- minimal styling (keeps your previous look) -------
    const shell = { minHeight: "100vh", background: "#f8fafc" };
    const container = { maxWidth: 960, margin: "0 auto" };
    const headerBar = { borderBottom: "1px solid #e5e7eb", background: "#fff" };
    const headerInner = {
        ...container,
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
    };
    const ghostBtn = {
        background: "transparent",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "8px 12px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        color: "#6b7280",
    };
    const titleWrap = { display: "flex", flexDirection: "column" };
    const main = { ...container, padding: 24 };
    const card = {
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        boxShadow: "0 4px 16px rgba(0,0,0,0.03)",
    };
    const cardHeader = { padding: 16, borderBottom: "1px solid #f1f5f9" };
    const cardBody = { padding: 16 };
    const grid = {
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    };
    const label = {
        display: "block",
        fontSize: 14,
        fontWeight: 600,
        marginBottom: 6,
        color: "#111827",
    };
    const input = {
        width: "100%",
        height: 40,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        padding: "0 10px",
        fontSize: 14,
    };
    const textarea = {
        width: "100%",
        minHeight: 90,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        padding: 10,
        fontSize: 14,
        resize: "vertical",
    };
    const rowEnd = { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 };
    const btn = (primary = false) => ({
        height: 44,
        minWidth: 140,
        padding: "0 16px",
        borderRadius: 10,
        cursor: "pointer",
        border: primary ? "none" : "1px solid #e5e7eb",
        background: primary ? "#2563eb" : "transparent",
        color: primary ? "#fff" : "#111827",
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        justifyContent: "center",
    });

    return (
        <div style={shell}>
            {/* Header */}
            <header style={headerBar}>
                <div style={headerInner}>
                    <button type="button" onClick={onBack} style={ghostBtn} aria-label="Back to Dashboard">
                        <ArrowLeft size={16} />
                        <span>Back to Dashboard</span>
                    </button>
                    <div style={titleWrap}>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>New Study</h1>
                        <p style={{ margin: 0, color: "#6b7280" }}>Create a new echocardiogram study</p>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main style={main}>
                <form onSubmit={handleSubmit}>
                    {/* Patient Information */}
                    <section style={{ ...card, marginBottom: 16 }}>
                        <div style={cardHeader}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <User size={18} color="#2563eb" />
                                <strong>Patient Information</strong>
                            </div>
                            <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 14 }}>
                                Enter the patient’s demographic and identification details
                            </p>
                        </div>
                        <div style={cardBody}>
                            <div style={grid}>
                                <div>
                                    <label htmlFor="patientName" style={label}>
                                        Patient Name *
                                    </label>
                                    <input
                                        id="patientName"
                                        style={input}
                                        value={formData.patientName}
                                        onChange={(e) => handleInputChange("patientName", e.target.value)}
                                        placeholder="Enter full name"
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="patientId" style={label}>
                                        Patient ID/MRN *
                                    </label>
                                    <input
                                        id="patientId"
                                        style={input}
                                        value={formData.patientId}
                                        onChange={(e) => handleInputChange("patientId", e.target.value)}
                                        placeholder="e.g., MRN-123456"
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="dateOfBirth" style={label}>
                                        Date of Birth *
                                    </label>
                                    <input
                                        id="dateOfBirth"
                                        type="date"
                                        style={input}
                                        value={formData.dateOfBirth}
                                        onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="referringPhysician" style={label}>
                                        Referring Physician
                                    </label>
                                    <input
                                        id="referringPhysician"
                                        style={input}
                                        value={formData.referringPhysician}
                                        onChange={(e) => handleInputChange("referringPhysician", e.target.value)}
                                        placeholder="Dr. Smith"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Study Details */}
                    <section style={{ ...card, marginBottom: 16 }}>
                        <div style={cardHeader}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Calendar size={18} color="#2563eb" />
                                <strong>Study Details</strong>
                            </div>
                            <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 14 }}>
                                Specify when and why this study is being performed
                            </p>
                        </div>
                        <div style={cardBody}>
                            <div style={{ ...grid, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                                <div>
                                    <label htmlFor="studyDate" style={label}>
                                        Study Date *
                                    </label>
                                    <input
                                        id="studyDate"
                                        type="date"
                                        style={input}
                                        value={formData.studyDate}
                                        onChange={(e) => handleInputChange("studyDate", e.target.value)}
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="studyTime" style={label}>
                                        Study Time *
                                    </label>
                                    <input
                                        id="studyTime"
                                        type="time"
                                        style={input}
                                        value={formData.studyTime}
                                        onChange={(e) => handleInputChange("studyTime", e.target.value)}
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="priority" style={label}>
                                        Priority
                                    </label>
                                    <select
                                        id="priority"
                                        style={input}
                                        value={formData.priority}
                                        onChange={(e) => handleInputChange("priority", e.target.value)}
                                    >
                                        <option value="routine">Routine</option>
                                        <option value="urgent">Urgent</option>
                                        <option value="stat">STAT</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: 16 }}>
                                <label htmlFor="clinicalIndication" style={label}>
                                    Clinical Indication
                                </label>
                                <textarea
                                    id="clinicalIndication"
                                    style={textarea}
                                    value={formData.clinicalIndication}
                                    onChange={(e) => handleInputChange("clinicalIndication", e.target.value)}
                                    placeholder="Reason for study, symptoms, clinical history..."
                                    rows={3}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Upload DICOM */}
                    <section style={{ ...card, marginBottom: 16 }}>
                        <div style={cardHeader}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Upload size={18} color="#2563eb" />
                                <strong>Upload DICOM</strong>
                            </div>
                            <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 14 }}>
                                Select and upload the patient’s DICOM file. EF will be computed automatically.
                            </p>
                        </div>
                        <div style={cardBody}>
                            <div style={{ display: "grid", gap: 12 }}>
                                <UploadForm
                                    onStatus={(s) => setUploadStatus(s)}
                                    onUploading={(b) => setUploading(b)}
                                    onEF={(val) => setEf(val)}
                                    onUploaded={(payload) => {
                                        // payload: { study_uid, instance_id, ef? }
                                        setUploadedMeta(payload || null);
                                    }}
                                />
                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14 }}>
                    {uploadStatus || (uploading ? "Uploading..." : "No file uploaded yet.")}
                  </span>
                                    {ef != null && (
                                        <span style={{ fontWeight: 700, color: "#2563eb" }}>
                      EF: {Number(ef).toFixed(1)}%
                    </span>
                                    )}
                                </div>
                                {uploadedMeta?.study_uid && (
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                                        <div><strong>Study UID:</strong> {uploadedMeta.study_uid}</div>
                                        {uploadedMeta.instance_id && (
                                            <div><strong>Instance ID:</strong> {uploadedMeta.instance_id}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Actions */}
                    <div style={rowEnd}>
                        <button type="button" style={btn(false)} onClick={onBack} disabled={isSubmitting || uploading}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={btn(true)}
                            disabled={isSubmitting || uploading || !validateForm()}
                            title={uploading ? "Please wait for upload to finish" : ""}
                        >
                            {isSubmitting ? (
                                <>
                                    <Heart size={16} className="animate-pulse" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Create Study
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
};

export default NewStudy;
