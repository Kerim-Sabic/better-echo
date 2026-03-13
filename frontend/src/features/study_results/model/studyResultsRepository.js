import { getStudyByUidApi } from "@/api/StudiesApi";
import {
  getPanechoEchoprimeCombinedResults,
  updatePanechoEchoprimeOverrides,
} from "@/api/results/PanechoEchoprimeResultsApi";
import { getDynamicMeasurementsCombinedResults } from "@/api/results/DynamicMeasurementsResultsApi";
import { getLlmReportResults } from "@/api/results/LlmReportResultsApi";
import {
  formatDynamicMeasurementsResultsDto,
  formatLlmReportResultsDto,
  formatPanechoEchoprimeResultsDto,
  formatStudyMetaDto,
} from "./studyResults.dto";

export const studyResultsRepository = {
  async getPanechoEchoprimeCombinedResults(studyUid) {
    const rawPanechoEchoprimeCombinedResultsResponse = await getPanechoEchoprimeCombinedResultsApi(studyUid);
    console.log("[Repository][PanechoCombined] raw:", rawPanechoEchoprimeCombinedResultsResponse);

    const formattedPanechoEchoprimeCombinedResults = formatPanechoEchoprimeCombinedResultsDto(
      rawPanechoEchoprimeCombinedResultsResponse
    );

    console.log("[Repository][PanechoCombined] formatted:", formattedPanechoEchoprimeCombinedResults);
    return formattedPanechoEchoprimeCombinedResults;
  },
};
