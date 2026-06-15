import { useQuery } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

const POLL_INTERVAL_MS = 3000;

export function useStudyOverlaysQuery(
  studyUid,
  { enabled = true, pollWhileProcessing = false } = {}
) {
  return useQuery({
    queryKey: ["studyOverlays", studyUid],
    enabled: Boolean(enabled && studyUid),
    queryFn: () => studyResultsRepository.getStudyOverlays(studyUid),
    staleTime: 0,
    refetchInterval: query => {
      const aiOverlays = query.state.data?.aiOverlays || [];
      const hasProcessingOverlay = aiOverlays.some(
        overlay => overlay.status === "queued" || overlay.status === "running"
      );

      return pollWhileProcessing || hasProcessingOverlay
        ? POLL_INTERVAL_MS
        : false;
    },
    refetchIntervalInBackground: true,
  });
}
