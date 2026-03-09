import { useQuery } from "@tanstack/react-query";
import { getStudyPipelineStatus } from "../../../../api/orchestration_apis/PipelineApi";

const ACTIVE_PIPELINE_STATUSES = new Set(["queued", "running"]);
const FAILED_PIPELINE_STATUS = "failed";
const CANCELLED_PIPELINE_STATUS = "cancelled";

export function usePipelineStatusQuery(
  studyUid,
  { enabled = true, queryKeyPrefix = "pipelineStatus" } = {}
) {
  return useQuery({
    queryKey: [queryKeyPrefix, studyUid],
    enabled: Boolean(enabled && studyUid),
    queryFn: () => getStudyPipelineStatus(studyUid),
    select: response => {
      const hasJob = Boolean(response?.data?.has_job);
      const pipeline = response?.data?.pipeline ?? null;
      const pipelineStatus = pipeline?.status ?? null;

      const isActive = hasJob && ACTIVE_PIPELINE_STATUSES.has(pipelineStatus);
      const isFailed = hasJob && pipelineStatus === FAILED_PIPELINE_STATUS;
      const isCancelled = hasJob && pipelineStatus === CANCELLED_PIPELINE_STATUS;
      const isTerminal = hasJob && !isActive;

      return {
        ...response,
        hasJob,
        pipeline,
        pipelineStatus,
        isActive,
        isFailed,
        isCancelled,
        isTerminal,
      };
    },
    refetchInterval: query => {
      const response = query.state.data;

      if (!response) {
        return 2000;
      }

      if (!response.hasJob) {
        return false;
      }

      if (response.isActive) {
        return 2000;
      }

      return false;
    },
    refetchIntervalInBackground: true,
  });
}
