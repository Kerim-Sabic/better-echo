import { useCallback, useMemo, useState } from "react";
import { toObject } from "@/general_components/utility/dataShapeUtils";
import { usePatchPanechoEchoprimeOverridesMutation } from "@/features/study_results/tanstack/mutations/usePatchPanechoEchoprimeOverridesMutation";
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

export function usePanechoEchoprimeEditorViewModel({
  studyUid,
  panechoEchoprimeCombinedResultsState,
  panechoEchoprimeCombinedResultsData,
  llmReportResultsState,
  llmReportResultsData,
}) {
  // --- Part 1. Initialize mutation hooks and derive edit-related source data. ---
  const patchPanechoEchoprimeOverridesMutation =
    usePatchPanechoEchoprimeOverridesMutation();
  const generateLlmReportMutation = useGenerateLlmReportMutation();

  const [savingPanechoEchoprimeOverrideKey, setSavingPanechoEchoprimeOverrideKey] =
    useState(null);

  const editBaselines = useMemo(
    () => toObject(panechoEchoprimeCombinedResultsData?.editBaselines),
    [panechoEchoprimeCombinedResultsData]
  );

  const panechoEchoprimeOverrides = useMemo(
    () => toObject(panechoEchoprimeCombinedResultsData?.overrides),
    [panechoEchoprimeCombinedResultsData]
  );

  const panechoEchoprimeOverridesUpdatedAt =
    panechoEchoprimeCombinedResultsData?.overridesUpdatedAt ?? null;

  const panechoEchoprimeOverridesUpdatedAtRaw =
    panechoEchoprimeCombinedResultsData?.overridesUpdatedAtRaw ?? null;

  const hasPanechoEchoprimeOverrides =
    Object.keys(panechoEchoprimeOverrides).length > 0;

  const canEditPanechoEchoprimeMeasurements = Boolean(
    studyUid && panechoEchoprimeCombinedResultsState === "ready"
  );

  // --- Part 2. Expose override lookup helpers and override save/reset actions. ---
  const getPanechoEchoprimeBaselineForKey = useCallback(
    key => {
      const measurementKey = normalizeMeasurementKey(key);
      if (!measurementKey) {
        return null;
      }

      return editBaselines[measurementKey] ?? null;
    },
    [editBaselines]
  );

  const getPanechoEchoprimeOverrideForKey = useCallback(
    key => {
      const measurementKey = normalizeMeasurementKey(key);
      if (!measurementKey) {
        return null;
      }

      return panechoEchoprimeOverrides[measurementKey] ?? null;
    },
    [panechoEchoprimeOverrides]
  );

  const savePanechoEchoprimeOverride = useCallback(
    async (key, overridePayload) => {
      if (!canEditPanechoEchoprimeMeasurements) {
        throw new Error("PanEcho/EchoPrime combined results are not ready.");
      }

      const measurementKey = normalizeMeasurementKey(key);
      if (!measurementKey) {
        throw new Error("A valid measurement key is required.");
      }

      const normalizedOverridePayload =
        normalizeOverridePayload(overridePayload);

      setSavingPanechoEchoprimeOverrideKey(measurementKey);

      try {
        return await patchPanechoEchoprimeOverridesMutation.mutateAsync({
          studyUid,
          overrides: {
            [measurementKey]: normalizedOverridePayload,
          },
        });
      } finally {
        setSavingPanechoEchoprimeOverrideKey(currentKey =>
          currentKey === measurementKey ? null : currentKey
        );
      }
    },
    [
      canEditPanechoEchoprimeMeasurements,
      patchPanechoEchoprimeOverridesMutation,
      studyUid,
    ]
  );

  const savePanechoEchoprimeValueOverride = useCallback(
    async (key, value) => {
      return savePanechoEchoprimeOverride(key, { value });
    },
    [savePanechoEchoprimeOverride]
  );

  const savePanechoEchoprimeLabelOverride = useCallback(
    async (key, label) => {
      return savePanechoEchoprimeOverride(key, { label });
    },
    [savePanechoEchoprimeOverride]
  );

  const clearPanechoEchoprimeOverride = useCallback(
    async key => {
      if (!canEditPanechoEchoprimeMeasurements) {
        throw new Error("PanEcho/EchoPrime combined results are not ready.");
      }

      const measurementKey = normalizeMeasurementKey(key);
      if (!measurementKey) {
        throw new Error("A valid measurement key is required.");
      }

      setSavingPanechoEchoprimeOverrideKey(measurementKey);

      try {
        return await patchPanechoEchoprimeOverridesMutation.mutateAsync({
          studyUid,
          overrides: {
            [measurementKey]: null,
          },
        });
      } finally {
        setSavingPanechoEchoprimeOverrideKey(currentKey =>
          currentKey === measurementKey ? null : currentKey
        );
      }
    },
    [
      canEditPanechoEchoprimeMeasurements,
      patchPanechoEchoprimeOverridesMutation,
      studyUid,
    ]
  );

  // --- Part 3. Derive AI report regeneration state and expose regenerate actions. ---
  const llmReportGeneratedAtRaw = llmReportResultsData?.reportGeneratedAtRaw ?? null;

  const isAiReportStale = useMemo(() => {
    if (!hasPanechoEchoprimeOverrides) {
      return false;
    }

    const overridesTimestamp = toTimestamp(panechoEchoprimeOverridesUpdatedAtRaw);
    if (overridesTimestamp === null) {
      return false;
    }

    const reportTimestamp = toTimestamp(llmReportGeneratedAtRaw);
    if (reportTimestamp === null) {
      return true;
    }

    return overridesTimestamp > reportTimestamp;
  }, [
    hasPanechoEchoprimeOverrides,
    llmReportGeneratedAtRaw,
    panechoEchoprimeOverridesUpdatedAtRaw,
  ]);

  const canRegenerateAiReport = Boolean(
    studyUid &&
      hasPanechoEchoprimeOverrides &&
      panechoEchoprimeCombinedResultsState === "ready" &&
      llmReportResultsState !== "pending" &&
      !generateLlmReportMutation.isPending
  );

  const regenerateAiReport = useCallback(async () => {
    if (!studyUid) {
      throw new Error("A study UID is required.");
    }

    if (!hasPanechoEchoprimeOverrides) {
      throw new Error(
        "At least one override is required before regenerating the AI Report."
      );
    }

    return generateLlmReportMutation.mutateAsync({ studyUid });
  }, [
    generateLlmReportMutation,
    hasPanechoEchoprimeOverrides,
    studyUid,
  ]);

  return {
    canEditPanechoEchoprimeMeasurements,

    editBaselines,
    panechoEchoprimeOverrides,
    panechoEchoprimeOverridesUpdatedAt,
    panechoEchoprimeOverridesUpdatedAtRaw,
    hasPanechoEchoprimeOverrides,

    isSavingPanechoEchoprimeOverride:
      patchPanechoEchoprimeOverridesMutation.isPending,
    savingPanechoEchoprimeOverrideKey,
    panechoEchoprimeOverrideSaveError:
      patchPanechoEchoprimeOverridesMutation.error ?? null,
    panechoEchoprimeOverrideSaveErrorMessage:
      extractMutationErrorMessage(
        patchPanechoEchoprimeOverridesMutation.error
      ),

    getPanechoEchoprimeBaselineForKey,
    getPanechoEchoprimeOverrideForKey,

    savePanechoEchoprimeOverride,
    savePanechoEchoprimeValueOverride,
    savePanechoEchoprimeLabelOverride,
    clearPanechoEchoprimeOverride,

    resetPanechoEchoprimeOverrideSaveState:
      patchPanechoEchoprimeOverridesMutation.reset,

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
