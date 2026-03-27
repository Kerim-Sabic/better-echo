import { useQuery } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

export function useStudyDetailsQuery(studyUid, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["studyDetails", studyUid],
    enabled: Boolean(enabled && studyUid),
    queryFn: () => studyResultsRepository.getStudyDetails(studyUid),
    staleTime: 60_000,
  });
}
