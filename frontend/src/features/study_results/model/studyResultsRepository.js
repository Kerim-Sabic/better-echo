import {
  getPanechoEchoprimeCombinedResultsApi,
  getDynamicMeasurementsCombinedResultsApi,
  getLlmReportApi,
} from "@/api/get_study_results_apis";
import { patchPanechoEchoprimeOverridesApi } from "@/api/panecho_echoprime_overrides/patchPanechoEchoprimeOverridesApi";
import { postGenerateLlmReportApi } from "@/api/llm_report_generate/postGenerateLlmReportApi";
import {
  formatDynamicMeasurementsCombinedResultsDto,
  formatPanechoEchoprimeCombinedResultsDto,
  formatLlmReportResultsDto,
} from "./studyResults.dto";

export const studyResultsRepository = {
  // Fetches and formats the combined PanEcho/EchoPrime results for the study results page.
  async getPanechoEchoprimeCombinedResults(studyUid) {
    const rawPanechoEchoprimeCombinedResults =
      await getPanechoEchoprimeCombinedResultsApi(studyUid);

    const formattedPanechoEchoprimeCombinedResults =
      formatPanechoEchoprimeCombinedResultsDto(
        rawPanechoEchoprimeCombinedResults
      );

    return formattedPanechoEchoprimeCombinedResults;
  },

  // Persists PanEcho/EchoPrime overrides and formats the updated combined results payload.
  async patchPanechoEchoprimeOverrides(studyUid, overrides) {
    const rawPatchedPanechoEchoprimeOverrides =
      await patchPanechoEchoprimeOverridesApi(studyUid, overrides);
    console.log(
      "RAW PATCHED PANECHO ECHOPRIME OVERRIDES: ",
      rawPatchedPanechoEchoprimeOverrides
    );

    const formattedPatchedPanechoEchoprimeOverrides =
      formatPanechoEchoprimeCombinedResultsDto(
        rawPatchedPanechoEchoprimeOverrides
      );
    console.log(
      "FORMATTED PATCHED PANECHO ECHOPRIME OVERRIDES: ",
      formattedPatchedPanechoEchoprimeOverrides
    );

    return formattedPatchedPanechoEchoprimeOverrides;
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
    console.log("RAW GENERATED LLM REPORT: ", rawGeneratedLlmReport);

    return rawGeneratedLlmReport;
  },
};
