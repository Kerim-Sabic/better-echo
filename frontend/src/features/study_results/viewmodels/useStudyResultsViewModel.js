import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePanechoEchoprimeCombinedResultsQuery } from "@/features/study_results/tanstack/queries/usePanechoEchoprimeCombinedResultsQuery";
import { useDynamicMeasurementsCombinedResultsQuery } from "@/features/study_results/tanstack/queries/useDynamicMeasurementsCombinedResultsQuery";
import { buildStudyResultsOhifAiPayload } from "@/features/study_results/viewmodels/ohifAiPayloadSerializer";

function resolveOverallState(states) {
  const normalizedStates = states.filter(Boolean);

  if (normalizedStates.some(state => state === "pending")) {
    return "pending";
  }

  if (normalizedStates.some(state => state === "error" || state === "failed")) {
    return "failed";
  }

  if (normalizedStates.every(state => state === "not_found")) {
    return "not_found";
  }

  if (normalizedStates.some(state => state === "loading")) {
    return "loading";
  }

  if (normalizedStates.some(state => state === "ready")) {
    return "ready";
  }

  return "idle";
}

export function useStudyResultsViewModel(studyUid) {
  const navigate = useNavigate();

  // --- Part 1. Data Fetching (Server State) ---
  const {
    data: panechoEchoprimeQueryData = null,
    isLoading: isPanechoEchoprimeLoading,
    isFetching: isPanechoEchoprimeFetching,
    error: panechoEchoprimeError,
    refetch: refetchPanechoEchoprime,
  } = usePanechoEchoprimeCombinedResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const {
    data: dynamicMeasurementsQueryData = null,
    isLoading: isDynamicMeasurementsLoading,
    isFetching: isDynamicMeasurementsFetching,
    error: dynamicMeasurementsError,
    refetch: refetchDynamicMeasurements,
  } = useDynamicMeasurementsCombinedResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const panechoEchoprimeCombinedResultsState =
    panechoEchoprimeQueryData?.state ??
    (isPanechoEchoprimeLoading ? "loading" : panechoEchoprimeError ? "error" : "idle");

  const dynamicMeasurementsCombinedResultsState =
    dynamicMeasurementsQueryData?.state ??
    (isDynamicMeasurementsLoading ? "loading" : dynamicMeasurementsError ? "error" : "idle");

  const panechoEchoprimeCombinedResultsData =
    panechoEchoprimeQueryData?.panechoEchoprimeResults ?? null;

  const viewerRefreshToken =
    dynamicMeasurementsQueryData?.viewerRefreshToken ?? "no-derived-dicom";

  const studyResultsState = resolveOverallState([
    panechoEchoprimeCombinedResultsState,
    dynamicMeasurementsCombinedResultsState,
  ]);

  const anyLoading =
    isPanechoEchoprimeLoading || isPanechoEchoprimeFetching || isDynamicMeasurementsLoading || isDynamicMeasurementsFetching;

  const isPolling =
    panechoEchoprimeCombinedResultsState === "pending" ||
    dynamicMeasurementsCombinedResultsState === "pending";

  const ohifAiPayload = useMemo(
    () =>
      buildStudyResultsOhifAiPayload({
        studyUid,
        panechoEchoprimeCombinedResultsState,
        panechoEchoprimeCombinedResultsData,
      }),
    [studyUid, panechoEchoprimeCombinedResultsState, panechoEchoprimeCombinedResultsData]
  );

  const onBack = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const refetchStudyResults = useCallback(() => {
    refetchPanechoEchoprime();
    refetchDynamicMeasurements();
  }, [refetchPanechoEchoprime, refetchDynamicMeasurements]);

  return {
    studyUid,
    studyResultsState,

    panechoEchoprimeCombinedResultsState,
    panechoEchoprimeCombinedResultsData,

    dynamicMeasurementsCombinedResultsState,

    anyLoading,
    isPolling,
    
    ohifAiPayload,
    viewerRefreshToken,

    onBack,
    refetchStudyResults,
  };
}
