import { getStudyByUidApi } from "@/api/StudiesApi";
import {
  getPanechoEchoprimeCombinedResults,
  updatePanechoEchoprimeOverrides,
} from "@/api/orchestration_apis/PanechoEchoprimeResultsApi";
import { getDynamicMeasurementsCombinedResults } from "@/api/orchestration_apis/DynamicMeasurementsResultsApi";
import { getLlmReportResults } from "@/api/orchestration_apis/LlmReportResultsApi";
import {
  formatDynamicMeasurementsResultsDto,
  formatLlmReportResultsDto,
  formatPanechoEchoprimeResultsDto,
  formatStudyMetaDto,
} from "./studyResults.dto";

export const studyResultsRepository = {
  async getPanechoEchoprimeCombinedResults(studyUid) {
    const rawCombinedResults = await getPanechoEchoprimeCombinedResults(studyUid);
    return formatPanechoEchoprimeResultsDto(rawCombinedResults);
  },

  async updatePanechoEchoprimeOverrides(studyUid, overrides) {
    const rawUpdatedResults = await updatePanechoEchoprimeOverrides(studyUid, overrides);
    return formatPanechoEchoprimeResultsDto(rawUpdatedResults);
  },

  async getDynamicMeasurementsCombinedResults(studyUid) {
    const rawDynamicResults = await getDynamicMeasurementsCombinedResults(studyUid);
    return formatDynamicMeasurementsResultsDto(rawDynamicResults);
  },

  async getLlmReportResults(studyUid) {
    const rawLlmReportResults = await getLlmReportResults(studyUid);
    return formatLlmReportResultsDto(rawLlmReportResults);
  },

  async getStudyMeta(studyUid) {
    const rawStudyMeta = await getStudyByUidApi(studyUid);
    return formatStudyMetaDto(rawStudyMeta);
  },
};
