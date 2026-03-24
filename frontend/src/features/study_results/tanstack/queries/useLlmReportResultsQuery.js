import { useQuery } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

const POLL_INTERVAL_MS = 3000;

export function useLlmReportResultsQuery(studyUid, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["llmReportResults", studyUid],
    enabled: Boolean(enabled && studyUid),
    queryFn: () => studyResultsRepository.getLlmReportResults(studyUid),
    staleTime: 0,
    refetchInterval: query => {
      const llmReportResultsState = query.state.data?.state;

      if (llmReportResultsState !== "pending") {
        return false;
      }

      return POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
  });
}
