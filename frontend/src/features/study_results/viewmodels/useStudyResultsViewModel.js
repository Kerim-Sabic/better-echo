import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePanechoEchoprimeCombinedResultsQuery } from "@/features/study_results/tanstack/queries/usePanechoEchoprimeCombinedResultsQuery";
import { useDynamicMeasurementsCombinedResultsQuery } from "@/features/study_results/tanstack/queries/useDynamicMeasurementsCombinedResultsQuery";
import { useLlmReportResultsQuery } from "@/features/study_results/tanstack/queries/useLlmReportResultsQuery";
import { useStudyDetailsQuery } from "@/features/study_results/tanstack/queries/useStudyDetailsQuery";
import { buildStudyResultsOhifAiPayload } from "@/features/study_results/viewmodels/ohifAiPayloadSerializer";
import { buildStudyResultsPdfData } from "@/features/study_results/viewmodels/pdf_printing/studyResultsPdfSerializer";
import {
  openAiMeasurementsPrintPreview,
  openAiReportPrintPreview,
} from "@/features/study_results/viewmodels/pdf_printing/studyResultsPdfGenerator";
import { usePanechoEchoprimeEditorViewModel } from "@/features/study_results/viewmodels/usePanechoEchoprimeEditorViewModel";

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

  const {
    data: llmReportQueryData = null,
    isLoading: isLlmReportLoading,
    isFetching: isLlmReportFetching,
    error: llmReportError,
    refetch: refetchLlmReport,
  } = useLlmReportResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const panechoEchoprimeCombinedResultsState =
    panechoEchoprimeQueryData?.state ??
    (isPanechoEchoprimeLoading ? "loading" : panechoEchoprimeError ? "error" : "idle");

  const dynamicMeasurementsCombinedResultsState =
    dynamicMeasurementsQueryData?.state ??
    (isDynamicMeasurementsLoading ? "loading" : dynamicMeasurementsError ? "error" : "idle");

  const llmReportResultsState =
    llmReportQueryData?.state ??
    (isLlmReportLoading ? "loading" : llmReportError ? "error" : "idle");

  const panechoEchoprimeCombinedResultsData =
    panechoEchoprimeQueryData?.panechoEchoprimeResults ?? null;

  const llmReportResultsData = llmReportQueryData?.llmReport ?? null;
  const llmReportResultsDetail = llmReportQueryData?.detail ?? null;

  const viewerRefreshToken =
    dynamicMeasurementsQueryData?.viewerRefreshToken ??
    "dynamic-measurements-not-ready";

  // --- Part 2. Compose the PanEcho/EchoPrime editing workflow ViewModel. ---
  const panechoEchoprimeEditorViewModel = usePanechoEchoprimeEditorViewModel({
    studyUid,
    panechoEchoprimeCombinedResultsState,
    panechoEchoprimeCombinedResultsData,
    llmReportResultsState,
    llmReportResultsData,
  });

  // --- Part 3. Derive page-level UI state and build the OHIF bridge payload. ---
  const studyResultsState = resolveOverallState([
    panechoEchoprimeCombinedResultsState,
    dynamicMeasurementsCombinedResultsState,
    llmReportResultsState,
  ]);

  const anyLoading =
    isPanechoEchoprimeLoading ||
    isPanechoEchoprimeFetching ||
    isDynamicMeasurementsLoading ||
    isDynamicMeasurementsFetching ||
    isLlmReportLoading ||
    isLlmReportFetching;

  const isPolling =
    panechoEchoprimeCombinedResultsState === "pending" ||
    dynamicMeasurementsCombinedResultsState === "pending" ||
    llmReportResultsState === "pending";

  const ohifAiPayload = useMemo(
    () =>
      buildStudyResultsOhifAiPayload({
        studyUid,
        panechoEchoprimeCombinedResultsState,
        panechoEchoprimeCombinedResultsData,
        llmReportResultsState,
        llmReportResultsData,
        llmReportResultsDetail,
        panechoEchoprimeEditorViewModel,
      }),
    [
      studyUid,
      panechoEchoprimeCombinedResultsState,
      panechoEchoprimeCombinedResultsData,
      llmReportResultsState,
      llmReportResultsData,
      llmReportResultsDetail,
      panechoEchoprimeEditorViewModel,
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
      panechoEchoprimeCombinedResultsState,
      panechoEchoprimeCombinedResultsData,
      llmReportResultsState,
      llmReportResultsData,
      llmReportResultsDetail,
      panechoEchoprimeEditorViewModel,
    });
  }, [
    studyUid,
    patientContext,
    studyResultsState,
    panechoEchoprimeCombinedResultsState,
    panechoEchoprimeCombinedResultsData,
    llmReportResultsState,
    llmReportResultsData,
    llmReportResultsDetail,
    panechoEchoprimeEditorViewModel,
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

// --- Part 5. onBack and refetchStudyResults handlers ---
  const onBack = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const refetchStudyResults = useCallback(() => {
    refetchPanechoEchoprime();
    refetchDynamicMeasurements();
    refetchLlmReport();
  }, [refetchPanechoEchoprime, refetchDynamicMeasurements, refetchLlmReport]);

  return {
    studyUid,
    studyResultsState,

    panechoEchoprimeCombinedResultsState,
    panechoEchoprimeCombinedResultsData,

    dynamicMeasurementsCombinedResultsState,

    llmReportResultsState,
    llmReportResultsData,
    llmReportResultsDetail,

    anyLoading,
    isPolling,

    ohifAiPayload,
    viewerRefreshToken,

    panechoEchoprimeEditorViewModel,

    canPrintAiMeasurementsDocument: Boolean(studyUid),
    canPrintAiReportDocument: Boolean(studyUid),
    printAiMeasurementsDocument,
    printAiReportDocument,

    onBack,
    refetchStudyResults,
  };
}
