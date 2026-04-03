import { useQuery } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

const POLL_INTERVAL_MS = 3000;

export function useStudyAnalysisCombinedResultsQuery(studyUid, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["studyAnalysisCombinedResults", studyUid],
    enabled: Boolean(enabled && studyUid),
    queryFn: () => studyResultsRepository.getStudyAnalysisCombinedResults(studyUid),
    staleTime: 0,
    refetchInterval: query => {
      const studyAnalysisCombinedResultsState = query.state.data?.state;

      if (studyAnalysisCombinedResultsState !== "pending") {
        return false;
      }

      return POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
  });
}
