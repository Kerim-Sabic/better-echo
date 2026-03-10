import { getPanechoEchoprimeCombinedResultsApi } from "@/api/get_study_results_apis";
import { formatPanechoEchoprimeCombinedResultsDto } from "./studyResults.dto";

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
