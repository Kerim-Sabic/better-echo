import { useNavigate } from "react-router-dom";
import { usePanechoEchoprimeCombinedResultsQuery } from "@/features/study_results/tanstack/queries/usePanechoEchoprimeCombinedResultsQuery";
import { buildStudyResultsOhifAiPayload } from "@/features/study_results/viewmodels/ohifAiPayloadSerializer";

export function useStudyResultsViewModel(studyUid) {
  const navigate = useNavigate();

  // --- Part 1. Data Fetching (Server State) ---
  const {
    data: panechoEchoprimeCombinedResultsQueryData = null,
    isLoading,
    isFetching,
    error,
    refetch: refetchPanechoEchoprimeCombinedResults,
  } = usePanechoEchoprimeCombinedResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  // --- Part 2. Derived Data ---
  const panechoEchoprimeCombinedResultsState =
    panechoEchoprimeCombinedResultsQueryData?.state ??
    (isLoading ? "loading" : "error");

  const panechoEchoprimeCombinedResultsData =
    panechoEchoprimeCombinedResultsQueryData?.panechoEchoprimeResults ?? null;

  const anyLoading = isLoading || isFetching;
  const isPolling = panechoEchoprimeCombinedResultsState === "pending";

  const ohifAiPayload = buildStudyResultsOhifAiPayload({
    studyUid,
    panechoEchoprimeCombinedResultsState,
    panechoEchoprimeCombinedResultsData,
  });

  // --- Part 3. Actions / Handlers ---
  const onBack = () => {
    navigate("/dashboard");
  };

  // --- Part 4. Compose View Model ---
  return {
    studyUid,
    panechoEchoprimeCombinedResultsState,
    panechoEchoprimeCombinedResultsError: error,

    panechoEchoprimeCombinedResultsData,

    anyLoading,
    isPolling,
    ohifAiPayload,

    onBack,
    refetchPanechoEchoprimeCombinedResults,
  };
}
