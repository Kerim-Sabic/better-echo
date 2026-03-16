import { getPanechoEchoprimeCombinedResultsApi } from "@/api/get_study_results_apis/getPanechoEchoprimeCombinedResultsApi";
import { formatPanechoEchoprimeCombinedResultsDto } from "./studyResults.dto";

export const studyResultsRepository = {
  async getPanechoEchoprimeCombinedResults(studyUid) {
    const rawPanechoEchoprimeCombinedResults =
      await getPanechoEchoprimeCombinedResultsApi(studyUid);
    console.log("RAW PANECHO ECHOPRIME COMBINED RESULTS: ", rawPanechoEchoprimeCombinedResults)

    const formattedPanechoEchoprimeCombinedResults =
      formatPanechoEchoprimeCombinedResultsDto(rawPanechoEchoprimeCombinedResults);
    console.log("FORMATTED PANECHO ECHOPRIME COMBINED RESULTS: ", formattedPanechoEchoprimeCombinedResults)

    return formattedPanechoEchoprimeCombinedResults;
  },
};
