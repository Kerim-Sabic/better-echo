import {
  getStudyAnalysisCombinedResultsApi,
  getDynamicMeasurementsCombinedResultsApi,
  getOverlayPayloadByUrlApi,
  getLlmReportApi,
  getStudyOverlaysApi,
} from "@/api/get_study_results_apis";
import { getStudyByUidApi } from "@/api/studies";
import { patchStudyAnalysisOverridesApi } from "@/api/study_analysis_overrides/patchStudyAnalysisOverridesApi";
import { postGenerateLlmReportApi } from "@/api/llm_report_generate/postGenerateLlmReportApi";
import { toArray } from "@/general_components/utility/dataShapeUtils";
import {
  formatDynamicMeasurementsCombinedResultsDto,
  formatLlmReportResultsDto,
  formatStudyAnalysisCombinedResultsDto,
  formatStudyDetailsDto,
} from "./studyResults.dto";
import {
  formatStudyOverlayInstancesDto,
  formatStudyOverlaysDto,
} from "./overlays.dto";

export const studyResultsRepository = {
  // Fetches and formats the study metadata used by the Study Results page.
  async getStudyDetails(studyUid) {
    const rawStudyDetails = await getStudyByUidApi(studyUid);
    const formattedStudyDetails = formatStudyDetailsDto(rawStudyDetails);
    return formattedStudyDetails;
  },

  // Fetches and formats the combined study-analysis results for the Study Results page.
  async getStudyAnalysisCombinedResults(studyUid) {
    const rawStudyAnalysisCombinedResults =
      await getStudyAnalysisCombinedResultsApi(studyUid);

    return formatStudyAnalysisCombinedResultsDto(
      rawStudyAnalysisCombinedResults
    );
  },

  // Persists study-analysis overrides and formats the updated combined results payload.
  async patchStudyAnalysisOverrides(studyUid, overrides) {
    const rawPatchedStudyAnalysisOverrides =
      await patchStudyAnalysisOverridesApi(studyUid, overrides);

    return formatStudyAnalysisCombinedResultsDto(
      rawPatchedStudyAnalysisOverrides
    );
  },

  // Fetches and formats the dynamic measurements combined observer payload.
  async getDynamicMeasurementsCombinedResults(studyUid) {
    const rawDynamicMeasurementsCombinedResults =
      await getDynamicMeasurementsCombinedResultsApi(studyUid);

    const formattedDynamicMeasurementsCombinedResults =
      formatDynamicMeasurementsCombinedResultsDto(
        rawDynamicMeasurementsCombinedResults
      );

    return formattedDynamicMeasurementsCombinedResults;
  },

  // Fetches overlay metadata and available structured payloads in the parent app.
  async getStudyOverlays(studyUid) {
    const rawStudyOverlays = await getStudyOverlaysApi(studyUid);

    if (rawStudyOverlays.status === 404 || !rawStudyOverlays.data) {
      return { aiOverlays: [], aiOverlayInstances: [] };
    }

    const overlaysWithDocuments = await Promise.all(
      toArray(rawStudyOverlays.data.overlays).map(async overlay => {
        if (
          !overlay?.available ||
          !overlay?.payload_url ||
          !overlay?.sop_instance_uid
        ) {
          return { ...overlay, document: null };
        }

        const payloadResponse = await getOverlayPayloadByUrlApi(overlay.payload_url);

        return {
          ...overlay,
          document: payloadResponse.data,
        };
      })
    );

    return {
      aiOverlays: formatStudyOverlaysDto(overlaysWithDocuments),
      aiOverlayInstances: formatStudyOverlayInstancesDto(
        rawStudyOverlays.data.instances
      ),
    };
  },

  // Fetches and formats the LLM report observer payload for display in the AI report tab.
  async getLlmReportResults(studyUid) {
    const rawLlmReportResults = await getLlmReportApi(studyUid);

    const formattedLlmReportResults =
      formatLlmReportResultsDto(rawLlmReportResults);

    return formattedLlmReportResults;
  },

  // Triggers regeneration of the LLM report based on the latest persisted combined results.
  async generateLlmReport(studyUid) {
    const rawGeneratedLlmReport = await postGenerateLlmReportApi(studyUid);
    return rawGeneratedLlmReport;
  },
};
