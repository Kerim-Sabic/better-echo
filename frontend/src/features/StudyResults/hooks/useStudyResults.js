import { useMemo } from "react";
import { useCombinedResultsQuery } from "./useCombinedResultsQuery";

/**
 * @returns {{
 *   state: "loading" | "pending" | "ready" | "not_found" | "error",
 *   error: unknown,
 *   studyUID: string | null,
 *   results: any,
 *   hasMeasurements: boolean,
 *   isPolling: boolean,
 *   refresh: () => void
 * }}
 */
export function useStudyResults(studyUid) {
    // Fetch PanEcho+EchoPrime combined results (polls while pending)
    const combinedResultsQuery = useCombinedResultsQuery(studyUid, {
        enabled: Boolean(studyUid),
    });

    // Derive a page-level state from the resource query
    const pageState = useMemo(() => {
        if (!studyUid) return "not_found";
        if (combinedResultsQuery.isError) return "error";

        const combinedResultsResponse = combinedResultsQuery.data;

        // First load
        if (!combinedResultsResponse) return "loading";

        // Not found
        if (combinedResultsResponse.status === 404) return "not_found";

        const isPending =
            combinedResultsResponse?.isPending ??
            (combinedResultsResponse.status === 202 &&
                combinedResultsResponse.data?.status === "pending");
        
        const isComplete = 
        combinedResultsResponse?.isComplete ??
        (combinedResultsResponse.status === 200 &&
            combinedResultsResponse.data?.status === "complete");

        if (isPending) return "pending";
        if (isComplete) return "ready";

        // Fallback
        return combinedResultsQuery.isFetching ? "loading" : "error";
    }, [studyUid, combinedResultsQuery.isError, combinedResultsQuery.isFetching, combinedResultsQuery.data])

    // Normalize UI data once (add more sections later as you add hooks)
    const combinedResults = useMemo(() => {
        const combinedResultsResponse = combinedResultsQuery.data;
        if (!combinedResultsResponse) return null;

        // Convenience field from 'select'
        if (combinedResultsResponse.results) return combinedResultsResponse.results;

        // Fallback: read directly from API shape
        if (
            combinedResultsResponse.status === 200 &&
            combinedResultsResponse.data?.status === "complete"
        ) {
            return combinedResultsResponse.data.panecho_echoprime_results ?? null;
        }
        return null;
    }, [combinedResultsQuery.data]);

    // The UI-facing contract: one stable object the page/layout consumes
    const viewModel = useMemo(
    () => ({
        state: pageState,
        error: combinedResultsQuery.error ?? null,

        // identifiers / header bits
        studyUID: studyUid ?? null,

        // data buckets
        results: combinedResults,
        hasMeasurements: Boolean(combinedResults),

        // controls
        isPolling: 
            (combinedResultsQuery.data?.isPending ??
                (combinedResultsQuery.data?.status === 202)) || false,
        refresh: () => combinedResultsQuery.refetch(),
    }),
    [
        pageState,
        combinedResultsQuery.error,
        studyUid,
        combinedResults,
        combinedResultsQuery.data,
        combinedResultsQuery.refetch,
    ]
    );

    return viewModel;
}