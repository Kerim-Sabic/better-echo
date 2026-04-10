import { useCallback, useMemo, useState } from "react";
import { toObject } from "@/general_components/utility/dataShapeUtils";
import { usePatchStudyAnalysisOverridesMutation } from "@/features/study_results/tanstack/mutations/usePatchStudyAnalysisOverridesMutation";
import { useGenerateLlmReportMutation } from "@/features/study_results/tanstack/mutations/useGenerateLlmReportMutation";

function normalizeMeasurementKey(key) {
  return typeof key === "string" ? key.trim() : "";
}

function extractMutationErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail.trim();
  }

  if (typeof error?.message === "string" && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return null;
}

function normalizeOverridePayload(overridePayload) {
  const payload = toObject(overridePayload);

  const hasValueField = Object.prototype.hasOwnProperty.call(payload, "value");
  const hasLabelField = Object.prototype.hasOwnProperty.call(payload, "label");

  const rawValue = payload.value;
  const rawLabel = payload.label;

  const hasValue =
    hasValueField &&
    rawValue !== null &&
    rawValue !== undefined &&
    rawValue !== "";

  const trimmedLabel =
    typeof rawLabel === "string" ? rawLabel.trim() : "";

  const hasLabel = hasLabelField && trimmedLabel.length > 0;

  if (hasValue && hasLabel) {
    throw new Error(
      "Override payload must include either a numeric value or a label, not both."
    );
  }

  if (hasValue) {
    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      throw new Error("Override value must be a valid number.");
    }

    return { value: numericValue };
  }

  if (hasLabel) {
    return { label: trimmedLabel };
  }

  throw new Error(
    "Override payload must include either a numeric value or a label."
  );
}

function toTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function useStudyAnalysisEditorViewModel({
  studyUid,
  studyAnalysisCombinedResultsState,
  studyAnalysisCombinedResultsData,
  llmReportResultsState,
  llmReportResultsData,
  readOnlySupport = false,
}) {
  // --- Part 1. Initialize mutation hooks and derive edit-related source data. ---
  const patchStudyAnalysisOverridesMutation =
    usePatchStudyAnalysisOverridesMutation();
  const generateLlmReportMutation = useGenerateLlmReportMutation();

  const [savingStudyAnalysisOverrideKey, setSavingStudyAnalysisOverrideKey] =
    useState(null);

  const editBaselines = useMemo(
    () => toObject(studyAnalysisCombinedResultsData?.editBaselines),
    [studyAnalysisCombinedResultsData]
  );

  const studyAnalysisOverrides = useMemo(
    () => toObject(studyAnalysisCombinedResultsData?.overrides),
    [studyAnalysisCombinedResultsData]
  );

  const studyAnalysisOverridesUpdatedAt =
    studyAnalysisCombinedResultsData?.overridesUpdatedAt ?? null;

  const studyAnalysisOverridesUpdatedAtRaw =
    studyAnalysisCombinedResultsData?.overridesUpdatedAtRaw ?? null;

  const hasStudyAnalysisOverrides =
    Object.keys(studyAnalysisOverrides).length > 0;

  const canEditStudyAnalysisMeasurements = Boolean(
    studyUid && studyAnalysisCombinedResultsState === "ready" && !readOnlySupport
  );

  // --- Part 2. Expose override lookup helpers and override save/reset actions. ---
  const getStudyAnalysisBaselineForKey = useCallback(
    key => {
      const measurementKey = normalizeMeasurementKey(key);
      if (!measurementKey) {
        return null;
      }

      return editBaselines[measurementKey] ?? null;
    },
    [editBaselines]
  );

  const getStudyAnalysisOverrideForKey = useCallback(
    key => {
      const measurementKey = normalizeMeasurementKey(key);
      if (!measurementKey) {
        return null;
      }

      return studyAnalysisOverrides[measurementKey] ?? null;
    },
    [studyAnalysisOverrides]
  );

  const saveStudyAnalysisOverride = useCallback(
    async (key, overridePayload) => {
      if (readOnlySupport) {
        throw new Error("Vendor access is read-only.");
      }

      if (!canEditStudyAnalysisMeasurements) {
        throw new Error("Study analysis results are not ready.");
      }

      const measurementKey = normalizeMeasurementKey(key);
      if (!measurementKey) {
        throw new Error("A valid measurement key is required.");
      }

      const normalizedOverridePayload =
        normalizeOverridePayload(overridePayload);

      setSavingStudyAnalysisOverrideKey(measurementKey);

      try {
        return await patchStudyAnalysisOverridesMutation.mutateAsync({
          studyUid,
          overrides: {
            [measurementKey]: normalizedOverridePayload,
          },
        });
      } finally {
        setSavingStudyAnalysisOverrideKey(currentKey =>
          currentKey === measurementKey ? null : currentKey
        );
      }
    },
    [
      canEditStudyAnalysisMeasurements,
      patchStudyAnalysisOverridesMutation,
      readOnlySupport,
      studyUid,
    ]
  );

  const saveStudyAnalysisValueOverride = useCallback(
    async (key, value) => {
      return saveStudyAnalysisOverride(key, { value });
    },
    [saveStudyAnalysisOverride]
  );

  const saveStudyAnalysisLabelOverride = useCallback(
    async (key, label) => {
      return saveStudyAnalysisOverride(key, { label });
    },
    [saveStudyAnalysisOverride]
  );

  const clearStudyAnalysisOverride = useCallback(
    async key => {
      if (readOnlySupport) {
        throw new Error("Vendor access is read-only.");
      }

      if (!canEditStudyAnalysisMeasurements) {
        throw new Error("Study analysis results are not ready.");
      }

      const measurementKey = normalizeMeasurementKey(key);
      if (!measurementKey) {
        throw new Error("A valid measurement key is required.");
      }

      setSavingStudyAnalysisOverrideKey(measurementKey);

      try {
        return await patchStudyAnalysisOverridesMutation.mutateAsync({
          studyUid,
          overrides: {
            [measurementKey]: null,
          },
        });
      } finally {
        setSavingStudyAnalysisOverrideKey(currentKey =>
          currentKey === measurementKey ? null : currentKey
        );
      }
    },
    [
      canEditStudyAnalysisMeasurements,
      patchStudyAnalysisOverridesMutation,
      readOnlySupport,
      studyUid,
    ]
  );

  // --- Part 3. Derive AI report regeneration state and expose regenerate actions. ---
  const llmReportGeneratedAtRaw = llmReportResultsData?.reportGeneratedAtRaw ?? null;

  const isAiReportStale = useMemo(() => {
    if (!hasStudyAnalysisOverrides) {
      return false;
    }

    const overridesTimestamp = toTimestamp(studyAnalysisOverridesUpdatedAtRaw);
    if (overridesTimestamp === null) {
      return false;
    }

    const reportTimestamp = toTimestamp(llmReportGeneratedAtRaw);
    if (reportTimestamp === null) {
      return true;
    }

    return overridesTimestamp > reportTimestamp;
  }, [
    hasStudyAnalysisOverrides,
    llmReportGeneratedAtRaw,
    studyAnalysisOverridesUpdatedAtRaw,
  ]);

  const canRegenerateAiReport = Boolean(
    studyUid &&
      hasStudyAnalysisOverrides &&
      studyAnalysisCombinedResultsState === "ready" &&
      llmReportResultsState !== "pending" &&
      !readOnlySupport &&
      !generateLlmReportMutation.isPending
  );

  const regenerateAiReport = useCallback(async () => {
    if (readOnlySupport) {
      throw new Error("Vendor access is read-only.");
    }

    if (!studyUid) {
      throw new Error("A study UID is required.");
    }

    if (!hasStudyAnalysisOverrides) {
      throw new Error(
        "At least one override is required before regenerating the AI Report."
      );
    }

    return generateLlmReportMutation.mutateAsync({ studyUid });
  }, [
    generateLlmReportMutation,
    hasStudyAnalysisOverrides,
    readOnlySupport,
    studyUid,
  ]);

  return {
    canEditStudyAnalysisMeasurements,

    editBaselines,
    studyAnalysisOverrides,
    studyAnalysisOverridesUpdatedAt,
    studyAnalysisOverridesUpdatedAtRaw,
    hasStudyAnalysisOverrides,

    isSavingStudyAnalysisOverride:
      patchStudyAnalysisOverridesMutation.isPending,
    savingStudyAnalysisOverrideKey,
    studyAnalysisOverrideSaveError:
      patchStudyAnalysisOverridesMutation.error ?? null,
    studyAnalysisOverrideSaveErrorMessage:
      extractMutationErrorMessage(
        patchStudyAnalysisOverridesMutation.error
      ),

    getStudyAnalysisBaselineForKey,
    getStudyAnalysisOverrideForKey,

    saveStudyAnalysisOverride,
    saveStudyAnalysisValueOverride,
    saveStudyAnalysisLabelOverride,
    clearStudyAnalysisOverride,

    resetStudyAnalysisOverrideSaveState:
      patchStudyAnalysisOverridesMutation.reset,

    canRegenerateAiReport,
    isAiReportStale,
    isRegeneratingAiReport: generateLlmReportMutation.isPending,
    regenerateAiReport,
    regenerateAiReportError: generateLlmReportMutation.error ?? null,
    regenerateAiReportErrorMessage: extractMutationErrorMessage(
      generateLlmReportMutation.error
    ),
    resetRegenerateAiReportState: generateLlmReportMutation.reset,
  };
}
