// features/new-study/NewStudy.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadDicomApi } from "../api/UploadDicomApi";
import UploadDicomCard from "../features/NewStudy/UploadDicomCard";
import MetadataPreview from "../features/NewStudy/MetadataPreview";
import ManualInfoForm from "../features/NewStudy/ManualInfoForm";
import { pickTags } from "../features/NewStudy/utils";
import { Button } from "../components/ui/button";

export default function NewStudy() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [isUploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [studyUID, setStudyUID] = useState(null);
  const [instanceId, setInstanceId] = useState(null);
  const [tags, setTags] = useState(null);

  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState({
    patientName: "",
    patientId: "",
    dateOfBirth: "",
    referringPhysician: "",
    clinicalIndication: "",
    notes: "",
  });

  const prefillFromTags = (t) => {
    setForm((prev) => ({
      ...prev,
      patientName: t.PatientName || prev.patientName,
      patientId: t.PatientID || prev.patientId,
      dateOfBirth: t.PatientBirthDate || prev.dateOfBirth,
      referringPhysician: t.ReferringPhysicianName || prev.referringPhysician,
    }));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus("Uploading DICOM…");

    try {
      const data = await uploadDicomApi(file);
      const { study_uid, instance_id, tags: dicomTags } = data || {};
      if (!study_uid) {
        setStatus("Upload OK, but StudyInstanceUID missing.");
        setUploading(false);
        return;
      }
      setStudyUID(study_uid);
      setInstanceId(instance_id || null);
      const cleaned = pickTags(dicomTags || {});
      setTags(cleaned);
      prefillFromTags(cleaned);
      setStatus("Upload complete. Metadata parsed.");
    } catch (e) {
      console.error(e);
      setStatus("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const createStudyAndAnalyze = () => {
    if (!studyUID) {
      setStatus("Please upload a DICOM first.");
      return;
    }
    navigate(`/studies/${encodeURIComponent(studyUID)}`, {
      state: { study_uid: studyUID, instance_id: instanceId },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container flex items-center justify-between px-6 py-4 mx-auto">
          <div className="flex items-center space-x-4">
            <img
              src="/lovable-uploads/9d9bcdf0-8a16-4777-8dc3-85ea7af6f600.png"
              alt="Horalix Logo"
              className="w-8 h-8"
            />
            <div>
              <h1 className="text-2xl font-bold text-foreground">New Study</h1>
              <p className="text-sm text-muted-foreground">
                Upload a DICOM to create a study. You can add/override patient
                info if needed.
              </p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">{status}</div>
        </div>
      </header>

      {/* Content */}
      <main className="container grid gap-6 px-6 py-6 mx-auto">
        <UploadDicomCard
          file={file}
          setFile={setFile}
          studyUID={studyUID}
          isUploading={isUploading}
          onUpload={handleUpload}
          onReparse={() => setTags(pickTags(tags))}
        />

        {studyUID && <MetadataPreview tags={tags} />}
        {studyUID && (
          <p className="text-sm text-muted-foreground">
            Tip: Click <span className="font-medium">Continue to Results</span> to view the study while EF analysis runs.
          </p>
        )}

        <ManualInfoForm
          showManual={showManual}
          setShowManual={setShowManual}
          form={form}
          setForm={setForm}
        />

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Cancel
          </Button>
          <Button
            className="btn-clinical"
            onClick={createStudyAndAnalyze}
            disabled={!studyUID}
          >
            Continue to Results
          </Button>
        </div>
      </main>
    </div>
  );
}
