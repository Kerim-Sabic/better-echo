import { useQuery } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

const POLL_INTERVAL_MS = 3000;

export function useDynamicMeasurementsCombinedResultsQuery(studyUid,{ enabled = true } = {}) {
  return useQuery({
    queryKey: ["dynamicMeasurementsCombinedResults", studyUid],
    enabled: Boolean(enabled && studyUid),
    queryFn: () => studyResultsRepository.getDynamicMeasurementsCombinedResults(studyUid),
    staleTime: 0,
    refetchInterval: query => {
      const dynamicMeasurementsCombinedResultsState = query.state.data?.state;

      if (dynamicMeasurementsCombinedResultsState !== "pending") {
        return false;
      }

      return POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
  });
}
