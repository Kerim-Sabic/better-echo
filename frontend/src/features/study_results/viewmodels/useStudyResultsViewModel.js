import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStudyAnalysisCombinedResultsQuery } from "@/features/study_results/tanstack/queries/useStudyAnalysisCombinedResultsQuery";
import { useDynamicMeasurementsCombinedResultsQuery } from "@/features/study_results/tanstack/queries/useDynamicMeasurementsCombinedResultsQuery";
import { useLlmReportResultsQuery } from "@/features/study_results/tanstack/queries/useLlmReportResultsQuery";
import { useStudyDetailsQuery } from "@/features/study_results/tanstack/queries/useStudyDetailsQuery";
import { buildStudyResultsOhifAiPayload } from "@/features/study_results/viewmodels/ohifAiPayloadSerializer";
import { buildStudyResultsPdfData } from "@/features/study_results/viewmodels/pdf_printing/studyResultsPdfSerializer";
import {
  openAiMeasurementsPrintPreview,
  openAiReportPrintPreview,
} from "@/features/study_results/viewmodels/pdf_printing/studyResultsPdfGenerator";
import { useStudyAnalysisEditorViewModel } from "@/features/study_results/viewmodels/useStudyAnalysisEditorViewModel";

// Resolves a single page-level state from the three study results query states.
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

  // Fetches the study-level metadata used for the page header/PDF context.
  const { data: studyDetails = null } = useStudyDetailsQuery(studyUid);

  // --- Part 1. Query and normalize all study-results server state. ---
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

  const {
    data: llmReportQueryData = null,
    isLoading: isLlmReportLoading,
    isFetching: isLlmReportFetching,
    error: llmReportError,
    refetch: refetchLlmReport,
  } = useLlmReportResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const studyAnalysisCombinedResultsState =
    studyAnalysisQueryData?.state ??
    (isStudyAnalysisLoading ? "loading" : studyAnalysisError ? "error" : "idle");

  const dynamicMeasurementsCombinedResultsState =
    dynamicMeasurementsQueryData?.state ??
    (isDynamicMeasurementsLoading ? "loading" : dynamicMeasurementsError ? "error" : "idle");

  const llmReportResultsState =
    llmReportQueryData?.state ??
    (isLlmReportLoading ? "loading" : llmReportError ? "error" : "idle");

  const studyAnalysisCombinedResultsData =
    studyAnalysisQueryData?.studyAnalysisCombinedResults ?? null;

  const llmReportResultsData = llmReportQueryData?.llmReport ?? null;
  const llmReportResultsDetail = llmReportQueryData?.detail ?? null;

  const viewerRefreshToken =
    dynamicMeasurementsQueryData?.viewerRefreshToken ??
    "dynamic-measurements-not-ready";

  // --- Part 2. Compose the study-analysis editing workflow ViewModel. ---
  const studyAnalysisEditorViewModel = useStudyAnalysisEditorViewModel({
    studyUid,
    studyAnalysisCombinedResultsState,
    studyAnalysisCombinedResultsData,
    llmReportResultsState,
    llmReportResultsData,
  });

  // --- Part 3. Derive page-level UI state and build the OHIF bridge payload. ---
  const studyResultsState = resolveOverallState([
    studyAnalysisCombinedResultsState,
    dynamicMeasurementsCombinedResultsState,
    llmReportResultsState,
  ]);

  const anyLoading =
    isStudyAnalysisLoading ||
    isStudyAnalysisFetching ||
    isDynamicMeasurementsLoading ||
    isDynamicMeasurementsFetching ||
    isLlmReportLoading ||
    isLlmReportFetching;

  const isPolling =
    studyAnalysisCombinedResultsState === "pending" ||
    dynamicMeasurementsCombinedResultsState === "pending" ||
    llmReportResultsState === "pending";

  const ohifAiPayload = useMemo(
    () =>
      buildStudyResultsOhifAiPayload({
        studyUid,
        studyAnalysisCombinedResultsState,
        studyAnalysisCombinedResultsData,
        llmReportResultsState,
        llmReportResultsData,
        llmReportResultsDetail,
        studyAnalysisEditorViewModel,
      }),
    [
      studyUid,
      studyAnalysisCombinedResultsState,
      studyAnalysisCombinedResultsData,
      llmReportResultsState,
      llmReportResultsData,
      llmReportResultsDetail,
      studyAnalysisEditorViewModel,
    ]
  );

  // Normalizes the subset of study metadata needed by the PDF serializer.
  const patientContext = useMemo(() => {
    return {
      patientName: studyDetails?.patient?.patientName || null,
      patientId: studyDetails?.patient?.patientId || null,
      patientBirthDate: studyDetails?.patient?.patientBirthDate || null,
      patientSex: studyDetails?.patient?.patientSex || null,
      patientHeightCm: studyDetails?.patientHeightCm ?? null,
      patientWeightKg: studyDetails?.patientWeightKg ?? null,
      heartRateBpm: studyDetails?.heartRateBpm ?? null,
      studyDate: studyDetails?.studyDate || null,
      studyTime: studyDetails?.studyTime || null,
      uploadedAt: studyDetails?.uploadedAt || null,
      referringPhysicianName: studyDetails?.referringPhysicianName || null,
      sonographerName: studyDetails?.sonographerName || null,
      indication: studyDetails?.indication || null,
      machineName: studyDetails?.machineName || studyDetails?.modality || null,
      accessionNumber: studyDetails?.accessionNumber || null,
    };
  }, [studyDetails]);

  // Builds a fresh PDF input snapshot from the current study state at click time.
  const buildCurrentStudyResultsPdfData = useCallback(() => {
    if (!studyUid) {
      return null;
    }

    return buildStudyResultsPdfData({
      studyUid,
      patientContext,
      downloadRequestedAt: new Date(),
      studyResultsState,
      studyAnalysisCombinedResultsState,
      studyAnalysisCombinedResultsData,
      llmReportResultsState,
      llmReportResultsData,
      llmReportResultsDetail,
      studyAnalysisEditorViewModel,
    });
  }, [
    studyUid,
    patientContext,
    studyResultsState,
    studyAnalysisCombinedResultsState,
    studyAnalysisCombinedResultsData,
    llmReportResultsState,
    llmReportResultsData,
    llmReportResultsDetail,
    studyAnalysisEditorViewModel,
  ]);

  // Opens the measurements-specific print preview from the shared PDF data snapshot.
  const printAiMeasurementsDocument = useCallback(async () => {
    const studyResultsPdfData = buildCurrentStudyResultsPdfData();

    if (!studyResultsPdfData) {
      return;
    }

    await openAiMeasurementsPrintPreview(studyResultsPdfData);
  }, [buildCurrentStudyResultsPdfData]);

  // Opens the narrative AI report print preview from the same normalized study snapshot.
  const printAiReportDocument = useCallback(async () => {
    const studyResultsPdfData = buildCurrentStudyResultsPdfData();

    if (!studyResultsPdfData) {
      return;
    }

    await openAiReportPrintPreview(studyResultsPdfData);
  }, [buildCurrentStudyResultsPdfData]);

  // --- Part 4. Expose back-navigation and refetch handlers. ---
  const onBack = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const refetchStudyResults = useCallback(() => {
    refetchStudyAnalysis();
    refetchDynamicMeasurements();
    refetchLlmReport();
  }, [refetchStudyAnalysis, refetchDynamicMeasurements, refetchLlmReport]);

  return {
    studyUid,
    studyResultsState,

    studyAnalysisCombinedResultsState,
    studyAnalysisCombinedResultsData,

    dynamicMeasurementsCombinedResultsState,

    llmReportResultsState,
    llmReportResultsData,
    llmReportResultsDetail,

    anyLoading,
    isPolling,

    ohifAiPayload,
    viewerRefreshToken,

    studyAnalysisEditorViewModel,

    canPrintAiMeasurementsDocument: Boolean(studyUid),
    canPrintAiReportDocument: Boolean(studyUid),
    printAiMeasurementsDocument,
    printAiReportDocument,

    onBack,
    refetchStudyResults,
  };
}
