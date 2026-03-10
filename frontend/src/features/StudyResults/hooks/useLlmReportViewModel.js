import { useCallback, useMemo, useState } from "react";
import { generateLlmReport } from "../../../api/results/LlmReportResultsApi";

export function useLlmReportViewModel({
  state,
  llmReportResults,
  studyUID,
  latestOverrideAt,
  onRefresh,
}) {
  // ---- LLM report view model ---------------------------------------------
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState(null);

  const reportGeneratedAt = llmReportResults?.report_generated_at ?? null;
  const diagnosesCount = llmReportResults?.diagnoses_json?.length || 0;
  const showLoading = state !== "ready";
  const isEmpty = !llmReportResults;

  const isOutOfDate = useMemo(() => {
    if (!latestOverrideAt || !reportGeneratedAt) return false;
    const overrideTs = new Date(latestOverrideAt).getTime();
    const reportTs = new Date(reportGeneratedAt).getTime();
    if (!Number.isFinite(overrideTs) || !Number.isFinite(reportTs)) return false;
    return overrideTs > reportTs;
  }, [latestOverrideAt, reportGeneratedAt]);

  const handleRegenerate = useCallback(async () => {
    if (!studyUID || isRegenerating) return;
    setIsRegenerating(true);
    setRegenerateError(null);
    try {
      const resp = await generateLlmReport(studyUID);
      if (resp.status >= 400) {
        throw new Error("Failed to regenerate report");
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      setRegenerateError("Failed to regenerate report.");
    } finally {
      setIsRegenerating(false);
    }
  }, [isRegenerating, onRefresh, studyUID]);

  return {
    state,
    showLoading,
    isEmpty,
    llmReportResults,
    diagnosesCount,
    isOutOfDate,
    isRegenerating,
    regenerateError,
    canRegenerate: Boolean(studyUID) && !isRegenerating,
    onRegenerate: handleRegenerate,
  };
}
