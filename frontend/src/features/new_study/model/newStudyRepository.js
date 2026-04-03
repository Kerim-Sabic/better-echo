import { uploadDicomApi } from "@/api/upload_dicom/uploadDicomApi";
import {
  startStudyPipelineApi,
  promoteStudyPipelineDraftApi,
  cancelStudyPipelineApi,
} from "@/api/ai_inference_pipeline_apis";
import { formatUploadDicomResponseDto } from "./newStudy.dto";

export const newStudyRepository = {
  async uploadDicom(file) {
    const rawUploadDicomResponse = await uploadDicomApi(file);
    console.log("RAW UPLOAD DICOM RESPONSE", rawUploadDicomResponse);
    const formattedUploadDicomResponse = formatUploadDicomResponseDto(rawUploadDicomResponse);
    console.log("FORMATTED UPLOAD DICOM RESPONSE", formattedUploadDicomResponse);
    return formattedUploadDicomResponse;
  },

  async startStudyPipeline(
    studyUid,
    {
      runMode = "upload_preview",
      cleanupScope = "new_study",
      uploadedInstanceUids = [],
    } = {}
  ) {
    await startStudyPipelineApi(studyUid, {
      run_mode: runMode,
      cleanup_scope: cleanupScope,
      uploaded_instance_uids: uploadedInstanceUids,
    });
  },

  async promoteStudyPipelineDraft(studyUid) {
    const rawPipelineResponse = await promoteStudyPipelineDraftApi(studyUid);

    // Keep existing behavior (don't proceed when backend says draft is not promotable)
    if (rawPipelineResponse?.status === 409) {
      const detailMessage =
        rawPipelineResponse?.data?.detail ||
        "No promotable draft yet. Please wait for the pipeline to progress and try again.";
      throw new Error(detailMessage);
    }
  },

  async cancelStudyPipeline(studyUid) {
    await cancelStudyPipelineApi(studyUid);
  },
};
