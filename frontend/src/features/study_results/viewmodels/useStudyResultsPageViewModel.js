import { useStudyResults } from "@/features/StudyResults/hooks/useStudyResults";

export function useStudyResultsPageViewModel(studyUid) {
  return useStudyResults(studyUid);
}
