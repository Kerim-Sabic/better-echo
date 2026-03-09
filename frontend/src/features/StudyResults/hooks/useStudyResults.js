import { useMemo, useCallback } from "react";
import { useStudyResultsData } from "./useStudyResultsData";
import { useAiMeasurementsViewModel } from "./useAiMeasurementsViewModel";
import { useAiSegmentationsViewModel } from "./useAiSegmentationsViewModel";
import { useLlmReportViewModel } from "./useLlmReportViewModel";
import { useStudyResultsTabs } from "./useStudyResultsTabs";

/**
 * @returns {{
 *   state: "loading" | "pending" | "ready" | "not_found" | "error",
 *   error: unknown,
 *
 *   panEchoEchoprimeState:     "loading" | "pending" | "ready" | "not_found" | "error",
 *   dynamicMeasurementsState:  "loading" | "pending" | "ready" | "not_found" | "error",
 *   llmReportState:            "loading" | "pending" | "ready" | "not_found" | "error",
 *
 *   studyUID: string | null,
 *   // data buckets
 *   panechoEchoprimeResults: any,
 *   dynamicMeasurementsResults: any,
 *   llmReportResults: any,
 *   hasMeasurements: boolean,
 *   hasOverrides: boolean,
 *   latestOverrideAt: string | null,
 *   patientName: string | null,
 *   patientSex: string | null,
 *   activeTab: string,
 *   setActiveTab: (tab: string) => void,
 *   anyLoading: boolean,
 *   aiMeasurements: object,
 *   aiVideoMeasurements: object,
 *   llmReport: object,
 *   // controls
 *   isPolling: boolean,
 *   refresh: () => void,
 *   onPrint: () => void
 * }}
 */
export function useStudyResults(studyUid) {
  const {
    state: pageState,
    error: firstError,
    panEchoEchoprimeState,
    dynamicMeasurementsState,
    llmReportState,
    pipelineStatus,
    hasPipelineJob,
    pipelineJobId,
    panechoEchoprimeResults,
    dynamicMeasurementsResults,
    llmReportResults,
    hasMeasurements,
    hasOverrides,
    latestOverrideAt,
    patientName,
    patientSex,
    patientHeightCm,
    patientWeightKg,
    heartRateBpm,
    studyInstanceKey,
    isPolling,
    anyLoading,
    refresh: refreshAll,
    onPrint: handlePrint,
  } = useStudyResultsData(studyUid);

  const { activeTab, setActiveTab } = useStudyResultsTabs(studyUid);

  // ---- AI measurements view model ------------------------------------------
  const aiMeasurements = useAiMeasurementsViewModel({
    studyUid,
    panechoEchoprimeResults,
    panEchoEchoprimeState,
    studyInstanceKey,
    patientSex,
    patientHeightCm,
    patientWeightKg,
    heartRateBpm,
    refresh: refreshAll,
  });

  // ---- AI video measurements view model ------------------------------------
  const aiVideoMeasurements = useAiSegmentationsViewModel({
    state: dynamicMeasurementsState,
    dynamicMeasurementsResults,
  });

  // ---- LLM report view model -----------------------------------------------
  const llmReport = useLlmReportViewModel({
    state: llmReportState,
    llmReportResults,
    studyUID: studyUid ?? null,
    latestOverrideAt,
    onRefresh: refreshAll,
  });

  const handlePrintWithMode = useCallback(() => {
    handlePrint({
      isIndexedMode: aiMeasurements?.isIndexedMode,
      bsa: aiMeasurements?.bsa,
    });
  }, [handlePrint, aiMeasurements?.isIndexedMode, aiMeasurements?.bsa]);

  // ---- Compose UI-facing view model ----------------------------------------
  /* eslint-disable react-hooks/exhaustive-deps */
  const viewModel = useMemo(
    () => ({
      state: pageState,
      error: firstError,

      // Per-query states
      panEchoEchoprimeState,
      dynamicMeasurementsState,
      llmReportState,
      pipelineStatus,
      hasPipelineJob,
      pipelineJobId,

      // identifiers / header bits
      studyUID: studyUid ?? null,
      patientName,
      patientSex,
      patientHeightCm,
      patientWeightKg,
      heartRateBpm,
      studyInstanceKey,
      activeTab,
      setActiveTab,
      anyLoading,

      // data buckets
      panechoEchoprimeResults,
      dynamicMeasurementsResults,
      llmReportResults,

      hasMeasurements,
      hasOverrides,
      latestOverrideAt,

      aiMeasurements,
      aiVideoMeasurements,
      llmReport,

      // controls
      isPolling,
      refresh: refreshAll,
      onPrint: handlePrintWithMode,
    }),
    [
      pageState,
      firstError,
      studyUid,
      panechoEchoprimeResults,
      dynamicMeasurementsResults,
      llmReportResults,
      hasMeasurements,
      hasOverrides,
      latestOverrideAt,
      aiMeasurements,
      aiVideoMeasurements,
      llmReport,
      activeTab,
      anyLoading,
      handlePrintWithMode,
      isPolling,
      refreshAll,
      patientName,
      patientSex,
      patientHeightCm,
      patientWeightKg,
      heartRateBpm,
      studyInstanceKey,
      panEchoEchoprimeState,
      dynamicMeasurementsState,
      llmReportState,
      pipelineStatus,
      hasPipelineJob,
      pipelineJobId,
    ]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  return viewModel;
}
