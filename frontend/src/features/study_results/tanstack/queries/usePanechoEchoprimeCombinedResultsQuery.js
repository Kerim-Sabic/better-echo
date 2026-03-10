import { useQuery } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

const POLL_INTERVAL_MS = 3000;

export function usePanechoEchoprimeCombinedResultsQuery(studyUid, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["PanechoEchoprimeCombinedResults", studyUid],
    enabled: Boolean(enabled && studyUid),
    queryFn: () => studyResultsRepository.getPanechoEchoprimeCombinedResults(studyUid),
    staleTime: 0,
    refetchInterval: query =>
      query.state.data?.state === "pending" ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  });
}
