import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadDicomApi } from "../../../api/UploadDicomApi";
import { pickTags, getStudyUID } from "../utils";

export function useNewStudy() {
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [isUploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [studyUID, setStudyUID] = useState(null);
  const [instanceIds, setInstanceIds] = useState([]);
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
      if (!files.length) return;
      setUploading(true);
      setStatus("Uploading DICOM…");

      try {
        let firstUID = null;

        // 1. Loop through files and read StudyUID to check if all files belong to the same Study
        for (const file of files) {
          const studyUID = await getStudyUID(file);
          if (!studyUID) throw new Error(`Cannot read StudyUID for file ${file.name}`);

          if (!firstUID) firstUID = studyUID;
          else if (firstUID !== studyUID) {
            throw new Error(`File ${file.name} belongs to a different study. All files must belong to the same study.`);
          }
        }

        setStatus("All files verified. Uploading…");

        // 2. Now all files belong to the same study, proceed to upload
        const uploadedInstanceIds = [];
        let mergedTags = null;

        for (const file of files) {
          const data = await uploadDicomApi(file);
          const { study_uid, sop_instance_uid, tags: dicomTags } = data || {};
          uploadedInstanceIds.push(sop_instance_uid);
          if (!mergedTags) mergedTags = pickTags(dicomTags || {});
        }

        setStudyUID(firstUID);
        setInstanceIds(uploadedInstanceIds);
        setTags(mergedTags);
        prefillFromTags(mergedTags);

        setStatus(`Upload complete. ${files.length} files processed.`);

      } catch (err) {
        console.error(err);
        setStatus(`Upload failed: ${err.message}`);
      } finally {
        setUploading(false);
      }
    };

  // Navigate to study results page
  const createStudyAndAnalyze = () => {
    if (!studyUID) {
      setStatus("Please upload a DICOM files first.");
      return;
    }
    navigate(`/studies/${encodeURIComponent(studyUID)}`, {
      state: { study_uid: studyUID, instance_id: instanceIds },
    });
  };

  return {
    // state
    files, // The selected DICOM file (before uploading)
    setFiles, // Function to update 'file' when user picks a new DICOM
    isUploading, // Boolean: whether the upload is currently in progress
    status, // String: upload progress or error message for the UI
    studyUID, // The unique StudyInstanceUID returned from Orthanc after upload
    instanceIds, // The unique InstanceID of the uploaded DICOM (optional, Orthanc-generated)
    tags, // Extracted & cleaned DICOM metadata (PatientName, PatientID, etc.)
    showManual, // Boolean: whether to show the manual form for metadata input
    setShowManual, // Function to toggle 'showManual' (show/hide the manual entry form)
    form, // Object holding form values (patientName, patientId, notes, etc.)
    setForm, // Function to update form fields

    // actions
    handleUpload,          // Uploads the selected DICOM file, parses metadata, updates state
    createStudyAndAnalyze, // Navigates to the study page (using studyUID) for further analysis
    prefillFromTags,       // Populates the manual form fields with values from DICOM tags
    setTags,               // Allows manual overriding of extracted DICOM tags
  };
}
