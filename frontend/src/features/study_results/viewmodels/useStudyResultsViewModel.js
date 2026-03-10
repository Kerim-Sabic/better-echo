import { useEffect, useMemo } from "react";
import { usePanechoEchoprimeCombinedResultsQuery } from "@/features/study_results/tanstack/queries/usePanechoEchoprimeCombinedResultsQuery";

export function useStudyResultsViewModel(studyUid) {
  // Part 1. Data Fetching (Server State)
  const panechoEchoprimeCombinedResultsQuery = usePanechoEchoprimeCombinedResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  // Part 2. Derived Data
  const combinedData = panechoEchoprimeCombinedResultsQuery.data ?? null;
  const combinedState = combinedData?.state ?? (panechoEchoprimeCombinedResultsQuery.isLoading ? "loading" : "error");

  const panEchoEchoprimeState = combinedState === "failed" ? "error" : combinedState;

  const panechoEchoprimeResults = combinedData?.panechoEchoprimeResults ?? null;
  const retryAfter = combinedData?.retryAfter ?? null;
  const errorDetail = combinedData?.errorDetail ?? null;

  const pageState = !studyUid ? "idle" : panEchoEchoprimeState;
  const anyLoading = panechoEchoprimeCombinedResultsQuery.isFetching;
  const isPolling = panEchoEchoprimeState === "pending";

  useEffect(() => {
    console.log("[useStudyResultsViewModel] query:", {
      studyUid,
      status: panechoEchoprimeCombinedResultsQuery.status,
      fetchStatus: panechoEchoprimeCombinedResultsQuery.fetchStatus,
      isLoading: panechoEchoprimeCombinedResultsQuery.isLoading,
      isFetching: panechoEchoprimeCombinedResultsQuery.isFetching,
      isError: panechoEchoprimeCombinedResultsQuery.isError,
      error: panechoEchoprimeCombinedResultsQuery.error ?? null,
      data: panechoEchoprimeCombinedResultsQuery.data ?? null,
    });
  }, [
    studyUid,
    panechoEchoprimeCombinedResultsQuery.status,
    panechoEchoprimeCombinedResultsQuery.fetchStatus,
    panechoEchoprimeCombinedResultsQuery.isLoading,
    panechoEchoprimeCombinedResultsQuery.isFetching,
    panechoEchoprimeCombinedResultsQuery.isError,
    panechoEchoprimeCombinedResultsQuery.error,
    panechoEchoprimeCombinedResultsQuery.data,
  ]);

  // Part 3. Compose View Model
  return useMemo(
    () => ({
      state: pageState,
      error: panechoEchoprimeCombinedResultsQuery.error ?? null,
      combinedData,

      panEchoEchoprimeState,
      panechoEchoprimeResults,
      retryAfter,
      errorDetail,

      anyLoading,
      isPolling,
      refresh: panechoEchoprimeCombinedResultsQuery.refetch,

      panechoEchoprimeCombinedResultsQuery,
    }),
    [
      pageState,
      panechoEchoprimeCombinedResultsQuery.error,
      combinedData,
      panEchoEchoprimeState,
      panechoEchoprimeResults,
      retryAfter,
      errorDetail,
      anyLoading,
      isPolling,
      panechoEchoprimeCombinedResultsQuery,
    ]
  );
}
