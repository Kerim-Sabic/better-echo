import { 
  getStudyAnalysisCombinedResultsApi,
  getDynamicMeasurementsCombinedResultsApi,
 } from "@/api/get_study_results_apis";
import {
  formatDynamicMeasurementsCombinedResultsDto,
  formatStudyAnalysisCombinedResultsDto,
} from "./studyResults.dto";

export const studyResultsRepository = {
  async getStudyAnalysisCombinedResults(studyUid) {
    const rawStudyAnalysisCombinedResults =
      await getStudyAnalysisCombinedResultsApi(studyUid);

    return formatStudyAnalysisCombinedResultsDto(rawStudyAnalysisCombinedResults);
  },

  async getDynamicMeasurementsCombinedResults(studyUid) {
    const rawDynamicMeasurementsCombinedResults =
      await getDynamicMeasurementsCombinedResultsApi(studyUid);
    return formatDynamicMeasurementsCombinedResultsDto(rawDynamicMeasurementsCombinedResults);
  },
};
