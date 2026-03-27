import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStudyAnalysisCombinedResultsQuery } from "@/features/study_results/tanstack/queries/useStudyAnalysisCombinedResultsQuery";
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
    data: studyAnalysisQueryData = null,
    isLoading: isStudyAnalysisLoading,
    isFetching: isStudyAnalysisFetching,
    error: studyAnalysisError,
    refetch: refetchStudyAnalysis,
  } = useStudyAnalysisCombinedResultsQuery(studyUid, {
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

  const studyAnalysisCombinedResultsState =
    studyAnalysisQueryData?.state ??
    (isStudyAnalysisLoading ? "loading" : studyAnalysisError ? "error" : "idle");

  const dynamicMeasurementsCombinedResultsState =
    dynamicMeasurementsQueryData?.state ??
    (isDynamicMeasurementsLoading ? "loading" : dynamicMeasurementsError ? "error" : "idle");

  const studyAnalysisCombinedResultsData =
    studyAnalysisQueryData?.studyAnalysisResults ?? null;

  const viewerRefreshToken =
    dynamicMeasurementsQueryData?.viewerRefreshToken ?? "no-derived-dicom";

  const studyResultsState = resolveOverallState([
    studyAnalysisCombinedResultsState,
    dynamicMeasurementsCombinedResultsState,
  ]);

  const anyLoading =
    isStudyAnalysisLoading || isStudyAnalysisFetching || isDynamicMeasurementsLoading || isDynamicMeasurementsFetching;

  const isPolling =
    studyAnalysisCombinedResultsState === "pending" ||
    dynamicMeasurementsCombinedResultsState === "pending";

  const ohifAiPayload = useMemo(
    () =>
      buildStudyResultsOhifAiPayload({
        studyUid,
        studyAnalysisCombinedResultsState,
        studyAnalysisCombinedResultsData,
      }),
    [studyUid, studyAnalysisCombinedResultsState, studyAnalysisCombinedResultsData]
  );

  const onBack = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const refetchStudyResults = useCallback(() => {
    refetchStudyAnalysis();
    refetchDynamicMeasurements();
  }, [refetchStudyAnalysis, refetchDynamicMeasurements]);

  return {
    studyUid,
    studyResultsState,

    studyAnalysisCombinedResultsState,
    studyAnalysisCombinedResultsData,

    dynamicMeasurementsCombinedResultsState,

    anyLoading,
    isPolling,
    
    ohifAiPayload,
    viewerRefreshToken,

    onBack,
    refetchStudyResults,
  };
}
