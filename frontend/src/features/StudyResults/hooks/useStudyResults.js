import { useMemo } from "react";
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
 *   panechoEchoprimeResults: any,         // PanEcho + EchoPrime combined results
 *   dynamicMeasurementsResults: any,      // Dynamic + Measurements combined results
 *   llmReportResults: any,                // LLM report results
 *   hasMeasurements: boolean,
 *   hasOverrides: boolean,
 *   latestOverrideAt: string | null,
 *   patientName: string | null,
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
    panechoEchoprimeResults,
    dynamicMeasurementsResults,
    llmReportResults,
    hasMeasurements,
    hasOverrides,
    latestOverrideAt,
    patientName,
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

  // ---- Compose UI-facing view model ----------------------------------------
  // Note: Tracking specific values instead of entire query objects for performance
  /* eslint-disable react-hooks/exhaustive-deps */
  const viewModel = useMemo(
    () => ({
      state: pageState,
      error: firstError,

      // Per-query states
      panEchoEchoprimeState,
      dynamicMeasurementsState,
      llmReportState,

      // identifiers / header bits
      studyUID: studyUid ?? null,
      patientName,
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
      onPrint: handlePrint,
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
      handlePrint,
      isPolling,
      refreshAll,
      patientName,
      studyInstanceKey,

      panEchoEchoprimeState,
      dynamicMeasurementsState,
      llmReportState,
    ]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  return viewModel;
}
