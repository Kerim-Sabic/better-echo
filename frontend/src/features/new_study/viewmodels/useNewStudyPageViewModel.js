import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUploadDicomMutation } from "@/features/new_study/tanstack/mutations/useUploadDicomMutation";
import { pickTags, getStudyUID } from "@/features/new_study/model/newStudyFileUtils";

export function useNewStudyPageViewModel() {
  const navigate = useNavigate();

  // --- Data Fetching & Mutations (Server State) ---
  const uploadDicomMutation = useUploadDicomMutation();

  // --- Local UI State ---
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [studyUID, setStudyUID] = useState(null);
  const [instanceIds, setInstanceIds] = useState([]);
  const [tags, setTags] = useState(null);
  const [duplicatesFiles, setDuplicateFiles] = useState([]);

  // --- Actions / Handlers ---
  const handleUpload = async () => {
    if (!files.length) {
      return;
    }

    setStatus("Uploading DICOM files...");

    try {
      let firstStudyUID = null;

      for (const file of files) {
        const currentStudyUID = await getStudyUID(file);
        if (!currentStudyUID) {
          throw new Error(`Cannot read StudyUID for file ${file.name}`);
        }

        if (!firstStudyUID) {
          firstStudyUID = currentStudyUID;
        } else if (firstStudyUID !== currentStudyUID) {
          throw new Error(
            `File ${file.name} belongs to a different study. All files must belong to the same study.`
          );
        }
      }

      setStatus("All files verified. Uploading...");

      const uploadedInstanceIds = [];
      let mergedTags = null;
      const duplicateFileNames = [];
      let resolvedStudyUID = firstStudyUID;

      for (const file of files) {
        try {
          const formattedUploadResponse = await uploadDicomMutation.mutateAsync(file);
          const { study_uid, sop_instance_uid, tags: dicomTags } = formattedUploadResponse || {};

          if (study_uid) {
            resolvedStudyUID = study_uid;
          }
          if (sop_instance_uid) {
            uploadedInstanceIds.push(sop_instance_uid);
          }
          if (!mergedTags && dicomTags) {
            mergedTags = pickTags(dicomTags);
          }
        } catch (err) {
          const detailMessage = err?.response?.data?.detail || err?.message || "";
          if (detailMessage.includes("already been uploaded")) {
            duplicateFileNames.push(file.name);
            continue;
          }

          console.error(`Failed to upload ${file.name}`, err);
          setStatus(`Upload failed for ${file.name}: ${detailMessage}`);
          throw err;
        }
      }

      setDuplicateFiles(duplicateFileNames);
      setStudyUID(resolvedStudyUID);
      setInstanceIds(uploadedInstanceIds);

      if (mergedTags) {
        setTags(mergedTags);
      }

      setStatus(`Upload complete. ${files.length} files processed.`);
    } catch (err) {
      console.error(err);
      const detailMessage = err?.response?.data?.detail;
      setStatus(`Upload failed: ${detailMessage || err.message}`);
    }
  };

  const createStudyAndAnalyze = () => {
    if (!studyUID) {
      setStatus("Please upload DICOM files first.");
      return;
    }

    if (!instanceIds.length) {
      setStatus("No instances uploaded. Try uploading again.");
      return;
    }

    navigate(`/studies/${encodeURIComponent(studyUID)}`, {
      state: { study_uid: studyUID, instance_id: instanceIds },
    });
  };

  // --- Compose View Model ---
  return {
    files,
    setFiles,
    isUploading: uploadDicomMutation.isPending,
    status,
    studyUID,
    instanceIds,
    tags,
    duplicatesFiles,
    handleUpload,
    createStudyAndAnalyze,
    setTags,
  };
}
