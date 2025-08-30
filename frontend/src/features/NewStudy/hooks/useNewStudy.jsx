import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadDicomApi } from "../../../api/UploadDicomApi";
import { pickTags } from "../utils";

export function useNewStudy() {
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

  // Pre-fill form from DICOM tags
  const prefillFromTags = (t) => {
    setForm((prev) => ({
      ...prev,
      patientName: t.PatientName || prev.patientName,
      patientId: t.PatientID || prev.patientId,
      dateOfBirth: t.PatientBirthDate || prev.dateOfBirth,
      referringPhysician: t.ReferringPhysicianName || prev.referringPhysician,
    }));
  };

  // Handle DICOM upload
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

  // Navigate to study results page
  const createStudyAndAnalyze = () => {
    if (!studyUID) {
      setStatus("Please upload a DICOM first.");
      return;
    }
    navigate(`/studies/${encodeURIComponent(studyUID)}`, {
      state: { study_uid: studyUID, instance_id: instanceId },
    });
  };

  return {
    // state
    file,
    setFile,
    isUploading,
    status,
    studyUID,
    instanceId,
    tags,
    showManual,
    setShowManual,
    form,
    setForm,

    // actions
    handleUpload,
    createStudyAndAnalyze,
    prefillFromTags,
    setTags,
  };
}
