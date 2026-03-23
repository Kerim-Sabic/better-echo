import { 
  getPanechoEchoprimeCombinedResultsApi,
  getDynamicMeasurementsCombinedResultsApi,
 } from "@/api/get_study_results_apis";
import {
  formatDynamicMeasurementsCombinedResultsDto,
  formatPanechoEchoprimeCombinedResultsDto,
} from "./studyResults.dto";

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

  async getDynamicMeasurementsCombinedResults(studyUid) {
    const rawDynamicMeasurementsCombinedResults =
      await getDynamicMeasurementsCombinedResultsApi(studyUid);
    console.log("RAW DYNAMIC MEASUREMENTS COMBINED RESULTS: ", rawDynamicMeasurementsCombinedResults);

    const formattedDynamicMeasurementsCombinedResults =
      formatDynamicMeasurementsCombinedResultsDto(rawDynamicMeasurementsCombinedResults);
    console.log("FORMATTED DYNAMIC MEASUREMENTS COMBINED RESULTS: ",formattedDynamicMeasurementsCombinedResults);

    return formattedDynamicMeasurementsCombinedResults;
  },
};
