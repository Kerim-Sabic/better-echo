import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUploadDicomMutation } from "@/features/new_study/tanstack/mutations/useUploadDicomMutation";
import { useStartStudyPipelineMutation } from "@/features/new_study/tanstack/mutations/useStartStudyPipelineMutation";
import { usePromoteStudyPipelineDraftMutation } from "@/features/new_study/tanstack/mutations/usePromoteStudyPipelineDraftMutation";
import { useCancelStudyPipelineMutation } from "@/features/new_study/tanstack/mutations/useCancelStudyPipelineMutation";
import { getStudyUIDFromDicomFile } from "@/features/new_study/model/getStudyUIDFromDicomFile";

export const DICOM_UPLOAD_LIMIT_EXCEEDED = "DICOM_UPLOAD_LIMIT_EXCEEDED";

export function getDicomUploadMaxFiles() {
  const configuredValue = Number(process.env.REACT_APP_DICOM_UPLOAD_MAX_FILES || 30);
  return Number.isFinite(configuredValue) && configuredValue > 0
    ? Math.floor(configuredValue)
    : 30;
}

export function buildDicomUploadLimitMessage(selectedCount, maxFiles) {
  return `${DICOM_UPLOAD_LIMIT_EXCEEDED}: ${selectedCount} DICOM files were selected, but the configured limit is ${maxFiles}. Please retry with a smaller study.`;
}

export function useNewStudyPageViewModel() {
  const navigate = useNavigate();
  const dicomUploadMaxFiles = getDicomUploadMaxFiles();

  // --- Data Fetching & Mutations (Server State) ---
  const uploadDicomMutation = useUploadDicomMutation();
  const startStudyPipelineMutation = useStartStudyPipelineMutation();
  const promoteStudyPipelineDraftMutation = usePromoteStudyPipelineDraftMutation();
  const cancelStudyPipelineMutation = useCancelStudyPipelineMutation();

  // --- Local UI State ---
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [studyUID, setStudyUID] = useState(null);
  const [instanceIds, setInstanceIds] = useState([]);
  const [dicomTags, setDicomTags] = useState(null);
  const [duplicatesFiles, setDuplicateFiles] = useState([]);

  // --- Actions / Handlers ---
  const onBack = () => {
    navigate("/dashboard");
  };

  const selectDicomFiles = incomingFiles => {
    const incomingList = Array.from(incomingFiles || []);
    if (!incomingList.length) {
      return;
    }

    const existingNames = new Set((files || []).map(file => file.name));
    const freshFiles = incomingList.filter(file => !existingNames.has(file.name));
    const nextFiles = [...(files || []), ...freshFiles];

    if (nextFiles.length > dicomUploadMaxFiles) {
      setStatus(buildDicomUploadLimitMessage(nextFiles.length, dicomUploadMaxFiles));
      return;
    }

    setFiles(nextFiles);
  };

  const handleUpload = async () => {
    if (!files.length) {
      return;
    }
    if (files.length > dicomUploadMaxFiles) {
      setStatus(buildDicomUploadLimitMessage(files.length, dicomUploadMaxFiles));
      return;
    }

    setStatus("Uploading DICOM files...");

    try {
      let firstStudyUID = null;

      for (const file of files) {
        const currentStudyUID = await getStudyUIDFromDicomFile(file);
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
          const { studyUid, sopInstanceUid, dicomTags } = formattedUploadResponse || {};

          if (studyUid) {
            resolvedStudyUID = studyUid;
          }

          if (sopInstanceUid) {
            uploadedInstanceIds.push(sopInstanceUid);
          }

          if (!mergedTags && dicomTags) {
            mergedTags = dicomTags;
          }
        } catch (error) {
          const detailMessage = error?.response?.data?.detail || error?.message || "";
          if (detailMessage.includes("already been uploaded")) {
            duplicateFileNames.push(file.name);
            continue;
          }

          console.error(`Failed to upload ${file.name}`, error);
          setStatus(`Upload failed for ${file.name}: ${detailMessage}`);
          throw error;
        }
      }

      setDuplicateFiles(duplicateFileNames);
      setStudyUID(resolvedStudyUID);
      setInstanceIds(uploadedInstanceIds);

      if (mergedTags) {
        setDicomTags(mergedTags);
      }

      if (resolvedStudyUID && uploadedInstanceIds.length > 0) {
        setStatus("Upload complete. Starting AI pipeline...");

        try {
          await startStudyPipelineMutation.mutateAsync({
            studyUid: resolvedStudyUID,
            runMode: "upload_preview",
            cleanupScope: "new_study",
            uploadedInstanceUids: uploadedInstanceIds,
          });

          setStatus("Upload complete. AI pipeline started.");
        } catch (pipelineError) {
          console.error("Failed to start pipeline", pipelineError);
          const detailMessage = pipelineError?.response?.data?.detail || pipelineError?.message;
          setStatus(`Upload complete, but pipeline start failed: ${detailMessage || "Unknown error"}`);
        }
      } else {
        setStatus(`Upload complete. ${files.length} files processed.`);
      }
    } catch (error) {
      console.error(error);
      const detailMessage = error?.response?.data?.detail;
      setStatus(`Upload failed: ${detailMessage || error.message}`);
    }
  };

  const createStudyAndGoToResults = async () => {
    if (!studyUID) {
      setStatus("Please upload DICOM files first.");
      return;
    }

    if (promoteStudyPipelineDraftMutation.isPending) {
      return;
    }

    setStatus("Preparing study results...");

    try {
      await promoteStudyPipelineDraftMutation.mutateAsync(studyUID);

      navigate(`/studies/${encodeURIComponent(studyUID)}`, {
        state: { study_uid: studyUID, instance_id: instanceIds },
      });
    } catch (error) {
      console.error("Failed to continue to results", error);
      const detailMessage = error?.message || error?.response?.data?.detail;
      setStatus(`Failed to continue: ${detailMessage || "Unknown error"}`);
    }
  };

  const cancelAndGoBack = async () => {
    if (cancelStudyPipelineMutation.isPending) {
      return;
    }

    if (!studyUID) {
      navigate("/dashboard");
      return;
    }

    try {
      await cancelStudyPipelineMutation.mutateAsync(studyUID);
      navigate("/dashboard");
    } catch (error) {
      console.error("Failed to cancel pipeline", error);
      const detailMessage = error?.message || error?.response?.data?.detail;
      setStatus(`Failed to cancel: ${detailMessage || "Unknown error"}`);
    }
  };

  // --- Compose View Model ---
  return {
    files,
    setFiles,
    selectDicomFiles,
    dicomUploadMaxFiles,
    isDicomUploading: uploadDicomMutation.isPending || startStudyPipelineMutation.isPending,
    status,
    studyUID,
    instanceIds,
    dicomTags,
    setDicomTags,
    duplicatesFiles,
    isContinuingToResults: promoteStudyPipelineDraftMutation.isPending,
    isCancellingPipeline: cancelStudyPipelineMutation.isPending,
    onBack,
    handleUpload,
    createStudyAndGoToResults,
    cancelAndGoBack,
  };
}
