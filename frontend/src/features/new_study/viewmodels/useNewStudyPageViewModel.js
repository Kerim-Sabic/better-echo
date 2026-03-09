import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUploadDicomMutation } from "@/features/new_study/tanstack/mutations/useUploadDicomMutation";
import { pickTags, getStudyUID } from "@/features/new_study/model/newStudyFileUtils";
import {
  cancelStudyPipeline,
  promoteStudyPipelineDraft,
  startStudyPipeline,
} from "@/api/orchestration_apis/PipelineApi";

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
  const [pipelineJobId, setPipelineJobId] = useState(null);
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);
  const [isContinuingToResults, setIsContinuingToResults] = useState(false);
  const [isCancellingPipeline, setIsCancellingPipeline] = useState(false);

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

      if (resolvedStudyUID && uploadedInstanceIds.length > 0) {
        setIsStartingPipeline(true);
        setStatus("Upload complete. Starting AI pipeline...");

        try {
          const pipelineStartResponse = await startStudyPipeline(resolvedStudyUID, {
            run_mode: "upload_preview",
            cleanup_scope: "new_study",
            uploaded_instance_uids: uploadedInstanceIds,
          });

          setPipelineJobId(pipelineStartResponse?.data?.job_id ?? null);
          setStatus("Upload complete. AI pipeline started.");
        } catch (pipelineError) {
          console.error("Failed to start pipeline", pipelineError);
          const detailMessage = pipelineError?.response?.data?.detail || pipelineError?.message;
          setStatus(`Upload complete, but pipeline start failed: ${detailMessage || "Unknown error"}`);
        } finally {
          setIsStartingPipeline(false);
        }
      } else {
        setStatus(`Upload complete. ${files.length} files processed.`);
      }
    } catch (err) {
      console.error(err);
      const detailMessage = err?.response?.data?.detail;
      setStatus(`Upload failed: ${detailMessage || err.message}`);
      setIsStartingPipeline(false);
    }
  };

  const createStudyAndAnalyze = async () => {
    if (!studyUID) {
      setStatus("Please upload DICOM files first.");
      return;
    }

    if (isContinuingToResults) {
      return;
    }

    setIsContinuingToResults(true);
    setStatus("Preparing study results...");

    try {
      const promoteResponse = await promoteStudyPipelineDraft(studyUID);

      if (promoteResponse.status === 409) {
        const detailMessage =
          promoteResponse?.data?.detail ||
          "No promotable draft yet. Please wait for the pipeline to progress and try again.";
        setStatus(detailMessage);
        return;
      }

      if (promoteResponse.status === 200 || promoteResponse.status === 202) {
        navigate(`/studies/${encodeURIComponent(studyUID)}`, {
          state: { study_uid: studyUID, instance_id: instanceIds },
        });
        return;
      }

      setStatus("Unexpected promote response from backend.");
    } catch (err) {
      console.error("Failed to continue to results", err);
      const detailMessage = err?.response?.data?.detail || err?.message;
      setStatus(`Failed to continue: ${detailMessage || "Unknown error"}`);
    } finally {
      setIsContinuingToResults(false);
    }
  };

  const cancelAndGoBack = async () => {
    if (isCancellingPipeline) {
      return;
    }

    if (!studyUID) {
      navigate("/dashboard");
      return;
    }

    setIsCancellingPipeline(true);

    try {
      const cancelResponse = await cancelStudyPipeline(studyUID);
      if (cancelResponse.status === 409) {
        // No active cancellable job is safe to treat as a no-op for navigation.
        navigate("/dashboard");
        return;
      }

      navigate("/dashboard");
    } catch (err) {
      console.error("Failed to cancel pipeline", err);
      const detailMessage = err?.response?.data?.detail || err?.message;
      setStatus(`Failed to cancel: ${detailMessage || "Unknown error"}`);
    } finally {
      setIsCancellingPipeline(false);
    }
  };

  // --- Compose View Model ---
  return {
    files,
    setFiles,
    isUploading: uploadDicomMutation.isPending || isStartingPipeline,
    status,
    studyUID,
    instanceIds,
    tags,
    duplicatesFiles,
    pipelineJobId,
    isContinuingToResults,
    isCancellingPipeline,
    handleUpload,
    createStudyAndAnalyze,
    cancelAndGoBack,
    setTags,
  };
}
