import { useQuery } from "@tanstack/react-query";
import { getLlmReportResults } from "../../../api/LlmReportResultsApi";

/**
 * React Query hook that fetches (and conditionally polls) the
 * LLM report results for the given study.
 */

export function useLlmReportResultsQuery(
    studyUid,
    { enabled = true, queryKeyPrefix = "llmReportResults" } = {}
) {
    return useQuery({
        // cache key is per study
        queryKey: [queryKeyPrefix, studyUid],
        enabled: Boolean(enabled && studyUid),

        // one-shot fetch
        queryFn: () => getLlmReportResults(studyUid),

        // derive a UI-friendly shape (keeps your components simple)
        select: (response) => {
            const isPending =
                response?.status === 202 && response?.data?.status === "pending";
            const isComplete =
                response?.status === 200 && response?.data?.status === "complete";
            const results = isComplete ? response.data.llm_report : null;

            return {
                ...response, // {status, data, retryAfter}
                isPending, // true while server is "pending"
                isComplete, // true while server is "complete"
                results, // convenience: combined results or null
            };
        },

        // POLL ONLY while pending; stop automatically on complete/404
        refetchInterval: (query) => {
            const resp = query.state.data;
            if (!resp) return false;
            if (resp.status === 202 && resp.data?.status === "pending") {
                // honor server backoff if present; fallback to 3s
                const seconds = resp.retryAfter ?? 3;
                return Math.max(1000, seconds * 1000);
            }
            return false; // stop polling
        },
    });
}

// useQuery(...) returns a Query Result object with many fields.
/**
{
  // Your transformed data from `select` (or undefined before the first success):
  data?: {
    status: 200 | 202 | 404,
    data: any,                 // server JSON
    retryAfter: number | null, // seconds, if server told us
    isPending: boolean,        // convenience flag
    isComplete: boolean,       // convenience flag
    results: any | null        // convenience: combined results when complete
  },

  // Query lifecycle flags & helpers:
  isLoading: boolean,  // first load in progress, before we have any data
  isFetching: boolean, // a request is in-flight (can be true during polling)
  isError: boolean,    // queryFn (or select) threw
  error: unknown,      // the actual Error object if isError is true
  refetch: () => Promise<...>, // manual refetch
  // ...plus other fields (status, fetchStatus, etc.)
}
*/
