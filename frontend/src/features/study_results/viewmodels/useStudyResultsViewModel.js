import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getLicenseStatusApi } from "@/api/licensing";
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
import { DYNAMIC_MEASUREMENTS_PENDING_VIEWER_TOKEN } from "@/features/study_results/model/studyResults.constants";

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

export function useStudyResultsViewModel(
  studyUid,
  { accessMode = "user" } = {}
) {
  const navigate = useNavigate();
  const isVendorAccess = accessMode === "vendor";
  const { data: licenseStatus = null } = useQuery({
    queryKey: ["serverLicenseStatus"],
    queryFn: getLicenseStatusApi,
    enabled: !isVendorAccess,
    staleTime: 60_000,
  });
  const isReadOnlyAccess =
    isVendorAccess || licenseStatus?.status === "expired";

  // Fetches the study-level metadata used for the page header/PDF context.
  const {
    data: studyDetails = null,
    isLoading: isStudyDetailsLoading,
    isFetching: isStudyDetailsFetching,
  } = useStudyDetailsQuery(studyUid);
  const llmEnabled = Boolean(studyDetails?.llmEnabled);

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
    enabled: Boolean(studyUid && llmEnabled),
  });

  const studyAnalysisCombinedResultsState =
    studyAnalysisQueryData?.state ??
    (isStudyAnalysisLoading ? "loading" : studyAnalysisError ? "error" : "idle");

  const dynamicMeasurementsCombinedResultsState =
    dynamicMeasurementsQueryData?.state ??
    (isDynamicMeasurementsLoading ? "loading" : dynamicMeasurementsError ? "error" : "idle");

  const llmReportResultsState = llmEnabled
    ? llmReportQueryData?.state ??
      (isLlmReportLoading ? "loading" : llmReportError ? "error" : "idle")
    : "disabled";

  const studyAnalysisCombinedResultsData =
    studyAnalysisQueryData?.studyAnalysisCombinedResults ?? null;

  const llmReportResultsData = llmReportQueryData?.llmReport ?? null;
  const llmReportResultsDetail = llmReportQueryData?.detail ?? null;

  const viewerRefreshToken =
    dynamicMeasurementsQueryData?.viewerRefreshToken ??
    DYNAMIC_MEASUREMENTS_PENDING_VIEWER_TOKEN;

  // --- Part 2. Compose the study-analysis editing workflow ViewModel. ---
  const studyAnalysisEditorViewModel = useStudyAnalysisEditorViewModel({
    studyUid,
    studyAnalysisCombinedResultsState,
    studyAnalysisCombinedResultsData,
    llmEnabled,
    llmReportResultsState,
    llmReportResultsData,
    readOnlySupport: isReadOnlyAccess,
  });

  // --- Part 3. Derive page-level UI state and build the OHIF bridge payload. ---
  const studyResultsState = resolveOverallState(
    llmEnabled
      ? [
          studyAnalysisCombinedResultsState,
          dynamicMeasurementsCombinedResultsState,
          llmReportResultsState,
        ]
      : [
          studyAnalysisCombinedResultsState,
          dynamicMeasurementsCombinedResultsState,
        ]
  );

  const anyLoading =
    isStudyDetailsLoading ||
    isStudyDetailsFetching ||
    isStudyAnalysisLoading ||
    isStudyAnalysisFetching ||
    isDynamicMeasurementsLoading ||
    isDynamicMeasurementsFetching ||
    (llmEnabled && (isLlmReportLoading || isLlmReportFetching));

  const isPolling =
    studyAnalysisCombinedResultsState === "pending" ||
    dynamicMeasurementsCombinedResultsState === "pending" ||
    (llmEnabled && llmReportResultsState === "pending");

  const ohifAiPayload = useMemo(
    () =>
      buildStudyResultsOhifAiPayload({
        studyUid,
        studyAnalysisCombinedResultsState,
        studyAnalysisCombinedResultsData,
        llmReportEnabled: llmEnabled,
        llmReportResultsState,
        llmReportResultsData,
        llmReportResultsDetail,
        studyAnalysisEditorViewModel,
      }),
    [
      studyUid,
      studyAnalysisCombinedResultsState,
      studyAnalysisCombinedResultsData,
      llmEnabled,
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
      llmReportResultsState: llmEnabled ? llmReportResultsState : "disabled",
      llmReportResultsData: llmEnabled ? llmReportResultsData : null,
      llmReportResultsDetail: llmEnabled ? llmReportResultsDetail : null,
      studyAnalysisEditorViewModel,
    });
  }, [
    studyUid,
    patientContext,
    studyResultsState,
    studyAnalysisCombinedResultsState,
    studyAnalysisCombinedResultsData,
    llmEnabled,
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
    navigate(isVendorAccess ? "/vendor-admin" : "/dashboard");
  }, [isVendorAccess, navigate]);

  const refetchStudyResults = useCallback(() => {
    refetchStudyAnalysis();
    refetchDynamicMeasurements();
    if (llmEnabled) {
      refetchLlmReport();
    }
  }, [llmEnabled, refetchStudyAnalysis, refetchDynamicMeasurements, refetchLlmReport]);

  return {
    studyUid,
    isVendorAccess,
    studyResultsState,

    studyAnalysisCombinedResultsState,
    studyAnalysisCombinedResultsData,

    dynamicMeasurementsCombinedResultsState,

    llmReportResultsState,
    llmReportResultsData,
    llmReportResultsDetail,
    llmEnabled,

    anyLoading,
    isPolling,

    ohifAiPayload,
    viewerRefreshToken,

    studyAnalysisEditorViewModel,

    canPrintAiMeasurementsDocument: Boolean(studyUid),
    canPrintAiReportDocument: Boolean(studyUid && llmEnabled),
    printAiMeasurementsDocument,
    printAiReportDocument,

    onBack,
    refetchStudyResults,
  };
}
