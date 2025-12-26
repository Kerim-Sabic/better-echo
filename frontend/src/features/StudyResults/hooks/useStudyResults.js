import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanechoEchoprimeResultsQuery } from "./usePanechoEchoprimeResultsQuery";
import { useDynamicMeasurementsResultsQuery } from "./useDynamicMeasurementsResultsQuery";
import { useLlmReportResultsQuery } from "./useLlmReportResultsQuery";
import { useStudyMetaQuery } from "./useStudyMetaQuery";
import { buildAiMeasurementsProps } from "../helpers/buildAiMeasurementsProps";
import { updatePanechoEchoprimeOverrides } from "../../../api/orchestration_apis/PanechoEchoprimeResultsApi";
import { printMeasurements } from "../helpers/printMeasurements";

const EMPTY_OBJ = {};

const parseNumericInput = (rawValue) => {
  const cleaned = String(rawValue ?? "").replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

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
 *   // controls
 *   isPolling: boolean,
 *   refresh: () => void,
 *   onPrint: () => void
 * }}
 */
export function useStudyResults(studyUid) {
  // ---- Check if LLM is enabled at build time ------------------------------
  const isLLMEnabled = process.env.REACT_APP_ENABLE_LLM === 'true';

  // ---- Study metadata ------------------------------------------------------
  const studyMetaQuery = useStudyMetaQuery(studyUid, { enabled: Boolean(studyUid) });

  // ---- Queries --------------------------------------------------------------
  const panechoEchoprimeResultsQuery = usePanechoEchoprimeResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const dynamicMeasurementsResultsQuery = useDynamicMeasurementsResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const llmReportResultsQuery = useLlmReportResultsQuery(studyUid, {
    enabled: Boolean(studyUid) && isLLMEnabled, // Only fetch if LLM is enabled
  });
  // Future-ready: just add new resources here (e.g., useReportQuery)
  // Each resource should expose { data: {status, isPending, isComplete, results, ...}, isError, isFetching, refetch }
  const resources = [
    {
      key: "panechoEchoprime",
      query: panechoEchoprimeResultsQuery,
      extractResults: (resp) =>
        resp?.results ??
        (resp?.status === 200 && resp?.data?.status === "complete"
          ? resp?.data?.panecho_echoprime_results ?? null
          : null),
    },
    {
      key: "dynamicMeasurements",
      query: dynamicMeasurementsResultsQuery,
      extractResults: (resp) =>
        resp?.results ??
        (resp?.status === 200 && resp?.data?.status === "complete"
          ? resp?.data?.dynamic_measurements_results ?? null
          : null),
    },
    {
      key: "llmReport",
      query: llmReportResultsQuery,
      extractResults: (resp) =>
        resp?.results ??
        (resp?.status === 200 && resp?.data?.status === "complete"
          ? resp?.data?.llm_report ?? null
          : null),   
    },
  ];

  // ---- Aggregate page-level state ------------------------------------------
  const pageState = useMemo(() => {
    if (!studyUid) return "not_found";

    const datas = resources.map((resource) => resource.query.data);
    const fetchings = resources.map((resource) => resource.query.isFetching);
    const errors = resources.map((resource) => resource.query.isError);

    const noDataYet = datas.every((data) => !data);
    if (noDataYet || studyMetaQuery.isLoading) return "loading";

    const all404 = datas.length > 0 && datas.every((data) => data?.status === 404);
    if (all404) return "not_found";

    if (studyMetaQuery.isError) return "error";

    const anyPending = datas.some(
      (data) => data?.isPending || (data?.status === 202 && data?.data?.status === "pending")
    );
    if (anyPending) return "pending";

    const anyComplete = datas.some(
      (data) => data?.isComplete || (data?.status === 200 && data?.data?.status === "complete")
    );
    if (anyComplete) return "ready";

    const anyFetching = fetchings.some(Boolean);
    if (anyFetching) return "loading";

    const anyError = errors.some(Boolean);
    if (anyError) return "error";

    // Fallback
    return "error";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    studyUid,
    panechoEchoprimeResultsQuery.data,
    panechoEchoprimeResultsQuery.isFetching,
    panechoEchoprimeResultsQuery.isError,
    dynamicMeasurementsResultsQuery.data,
    dynamicMeasurementsResultsQuery.isFetching,
    dynamicMeasurementsResultsQuery.isError,
    llmReportResultsQuery.data,
    llmReportResultsQuery.isFetching,
    llmReportResultsQuery.isError,
    studyMetaQuery.isLoading,
    studyMetaQuery.isError,
  ]);

  // ---- Helper to compute a per-query state --------------------------------------
  const computeState = (query) => {
    const data = query.data;

    if (!studyUid) return "not_found";
    if (!data) return "loading";
    if (data.status === 404) return "not_found";
    if (query.isFetching) return "loading";
    if (data.isPending || (data.status === 202 && data.data?.status === "pending")) return "pending";
    if (data.isComplete || (data.status === 200 && data.data?.status === "complete")) return "ready";
    if (query.isError) return "error";

    return "error";
  };

  // ---- Individual states for each query -------------------------------------
  // Note: ESLint wants us to include the entire query objects and computeState function,
  // but we intentionally only track specific fields for better performance
  /* eslint-disable react-hooks/exhaustive-deps */
  const panEchoEchoprimeState = useMemo(
    () => computeState(panechoEchoprimeResultsQuery),
    [panechoEchoprimeResultsQuery.data, panechoEchoprimeResultsQuery.isFetching, panechoEchoprimeResultsQuery.isError]
  );

  const dynamicMeasurementsState = useMemo(
    () => computeState(dynamicMeasurementsResultsQuery),
    [dynamicMeasurementsResultsQuery.data, dynamicMeasurementsResultsQuery.isFetching, dynamicMeasurementsResultsQuery.isError]
  );

  const llmReportState = useMemo(
    () => {
      // If LLM is disabled, return undefined to show "disabled" message
      if (!isLLMEnabled) return undefined;
      return computeState(llmReportResultsQuery);
    },
    [isLLMEnabled, llmReportResultsQuery.data, llmReportResultsQuery.isFetching, llmReportResultsQuery.isError]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // ---- Normalize outputs per resource --------------------------------------
  const panechoEchoprimeResults = useMemo(() => {
    const response = panechoEchoprimeResultsQuery.data;
    if (!response) return null;
    // prefer pre-computed results from select()
    if (response.results) return response.results;
    // fallback to raw API shape
    if (response.status === 200 && response.data?.status === "complete") {
      return response.data.panecho_echoprime_results ?? null;
    }
    return null;
  }, [panechoEchoprimeResultsQuery.data]);

  const dynamicMeasurementsResults = useMemo(() => {
    const response = dynamicMeasurementsResultsQuery.data;
    if (!response) return null;
    if (response.results) return response.results;
    if (response.status === 200 && response.data?.status === "complete") {
      return response.data.dynamic_measurements_results ?? null;
    }
    return null;
  }, [dynamicMeasurementsResultsQuery.data]);

  const llmReportResults = useMemo(() => {
    const response = llmReportResultsQuery.data;
    if (!response) return null;
    if (response.results) return response.results;
    if (response.status === 200 && response.data?.status === "complete") {
      return response.data.llm_report ?? null;
    }
    return null;
  }, [llmReportResultsQuery.data]);

  const studyInstanceKey = useMemo(() => {
    const meta = studyMetaQuery.data?.data;
    if (!meta) return null;
    if (meta.id !== undefined && meta.id !== null) return String(meta.id);
    if (meta.uploaded_at) return String(meta.uploaded_at);
    return null;
  }, [studyMetaQuery.data]);

  const patientName = studyMetaQuery.data?.patientName ?? null;

  const panechoEchoprimeRefetch = panechoEchoprimeResultsQuery.refetch;
  const dynamicMeasurementsRefetch = dynamicMeasurementsResultsQuery.refetch;
  const llmReportRefetch = llmReportResultsQuery.refetch;
  const studyMetaRefetch = studyMetaQuery.refetch;

  const refreshAll = useCallback(() => {
    panechoEchoprimeRefetch();
    dynamicMeasurementsRefetch();
    if (isLLMEnabled) {
      llmReportRefetch();
    }
    studyMetaRefetch();
  }, [
    panechoEchoprimeRefetch,
    dynamicMeasurementsRefetch,
    llmReportRefetch,
    studyMetaRefetch,
    isLLMEnabled,
  ]);

  const [activeTab, setActiveTab] = useState("measurements");

  useEffect(() => {
    setActiveTab("measurements");
  }, [studyUid]);

  const handlePrint = useCallback(async () => {
    if (!studyUid) return;
    const result = await printMeasurements({ panechoEchoprimeResults, patientName, studyUID: studyUid });
    if (!result?.ok) {
      if (result?.reason === "no_measurements") {
        alert("No measurements to print.");
        return;
      }
      console.warn("Failed to prepare print", result?.error);
    }
  }, [panechoEchoprimeResults, patientName, studyUid]);

  const [aiEditingKey, setAiEditingKey] = useState(null);
  const [aiDraftOverrides, setAiDraftOverrides] = useState({});
  const [aiFieldErrors, setAiFieldErrors] = useState({});
  const [aiSavingKey, setAiSavingKey] = useState(null);
  const [aiCachedResults, setAiCachedResults] = useState(null);
  const aiCacheKeyRef = useRef(null);
  const aiActiveCacheKey = studyInstanceKey ?? studyUid ?? null;

  useEffect(() => {
    if (aiCacheKeyRef.current === aiActiveCacheKey) return;
    aiCacheKeyRef.current = aiActiveCacheKey;
    setAiCachedResults(null);
    setAiDraftOverrides({});
    setAiEditingKey(null);
    setAiFieldErrors({});
    setAiSavingKey(null);
  }, [aiActiveCacheKey]);

  useEffect(() => {
    if (panechoEchoprimeResults) {
      setAiCachedResults(panechoEchoprimeResults);
    }
  }, [panechoEchoprimeResults]);

  const aiActiveResults = panechoEchoprimeResults || aiCachedResults;

  const aiSavedOverrides = useMemo(
    () => aiActiveResults?.overrides || EMPTY_OBJ,
    [aiActiveResults?.overrides]
  );

  const aiIntegratedTasks = useMemo(
    () => aiActiveResults?.integrated_tasks || EMPTY_OBJ,
    [aiActiveResults?.integrated_tasks]
  );

  const aiPendingOverrides = useMemo(() => {
    const pending = {};
    Object.entries(aiDraftOverrides).forEach(([key, entry]) => {
      if (entry === null) {
        if (aiSavedOverrides?.[key]) {
          pending[key] = null;
        }
        return;
      }
      const task = aiIntegratedTasks[key];
      if (!task) return;
      if (entry?.label !== undefined) {
        const nextLabel = String(entry.label || "").trim();
        const baseline = aiSavedOverrides?.[key]?.label ?? task.integrated_label ?? "";
        if (nextLabel && nextLabel !== baseline) {
          pending[key] = { label: nextLabel };
        }
        return;
      }
      if (entry?.value !== undefined) {
        const parsed = parseNumericInput(entry.value);
        const baseline = aiSavedOverrides?.[key]?.value ?? task.integrated_value ?? null;
        if (parsed === null || baseline === null || Number(parsed) !== Number(baseline)) {
          pending[key] = { value: entry.value };
        }
      }
    });
    return pending;
  }, [aiDraftOverrides, aiIntegratedTasks, aiSavedOverrides]);

  const aiEffectiveOverrides = useMemo(() => {
    const merged = { ...aiSavedOverrides };
    Object.entries(aiPendingOverrides).forEach(([key, entry]) => {
      if (entry === null) {
        delete merged[key];
        return;
      }
      if (entry?.label !== undefined) {
        merged[key] = { ...(merged[key] || {}), label: entry.label };
        return;
      }
      if (entry?.value !== undefined) {
        const parsed = parseNumericInput(entry.value);
        if (parsed !== null) {
          merged[key] = { ...(merged[key] || {}), value: parsed };
        }
      }
    });
    return merged;
  }, [aiPendingOverrides, aiSavedOverrides]);

  const { mainMeasurements: aiMainMeasurements, Measurements: aiMeasurementsSections } = useMemo(
    () => buildAiMeasurementsProps(aiActiveResults, aiEffectiveOverrides),
    [aiActiveResults, aiEffectiveOverrides]
  );

  const aiHasMainMeasurements = Array.isArray(aiMainMeasurements) && aiMainMeasurements.length > 0;
  const aiHasMeasurements = Array.isArray(aiMeasurementsSections) && aiMeasurementsSections.length > 0;
  const aiTotalMeasurements =
    (aiHasMainMeasurements ? aiMainMeasurements.length : 0) +
    (aiHasMeasurements
      ? aiMeasurementsSections.reduce((sum, m) => sum + (m.items?.length || 0), 0)
      : 0);
  const aiIsEmpty = !aiHasMainMeasurements && !aiHasMeasurements;

  const handleAiStartEdit = useCallback((item) => {
    if (!item || !item.key) return;
    setAiEditingKey(item.key);
    setAiFieldErrors((prev) => ({ ...prev, [item.key]: null }));
    setAiDraftOverrides((prev) => {
      if (prev[item.key] !== undefined) return prev;
      const task = aiIntegratedTasks[item.key];
      if (!task) return prev;
      if (item.editType === "label") {
        const currentLabel = aiEffectiveOverrides?.[item.key]?.label ?? task.integrated_label ?? "";
        return { ...prev, [item.key]: { label: currentLabel } };
      }
      const currentValue = aiEffectiveOverrides?.[item.key]?.value ?? task.integrated_value;
      return {
        ...prev,
        [item.key]: {
          value: currentValue !== null && currentValue !== undefined ? String(currentValue) : "",
        },
      };
    });
  }, [aiEffectiveOverrides, aiIntegratedTasks]);

  const handleAiChangeValue = useCallback((key, nextValue) => {
    setAiDraftOverrides((prev) => ({ ...prev, [key]: { value: nextValue } }));
    setAiFieldErrors((prev) => ({ ...prev, [key]: null }));
  }, []);

  const handleAiChangeLabel = useCallback((key, nextLabel) => {
    setAiDraftOverrides((prev) => ({ ...prev, [key]: { label: nextLabel } }));
    setAiFieldErrors((prev) => ({ ...prev, [key]: null }));
  }, []);

  const clearAiDraftForKey = useCallback((key) => {
    setAiDraftOverrides((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const persistAiOverride = useCallback(async (key, payload) => {
    if (!studyUid) return;
    setAiSavingKey(key);
    setAiFieldErrors((prev) => ({ ...prev, [key]: null }));
    try {
      await updatePanechoEchoprimeOverrides(studyUid, { [key]: payload });
      clearAiDraftForKey(key);
      setAiEditingKey(null);
      refreshAll();
    } catch (err) {
      setAiFieldErrors((prev) => ({ ...prev, [key]: "Failed to save override." }));
    } finally {
      setAiSavingKey(null);
    }
  }, [clearAiDraftForKey, refreshAll, studyUid]);

  const handleAiStopEdit = useCallback((key) => {
    if (!key) {
      setAiEditingKey(null);
      return;
    }

    const draft = aiDraftOverrides?.[key];
    if (draft?.label !== undefined) {
      const label = String(draft.label || "").trim();
      if (!label) {
        setAiFieldErrors((prev) => ({ ...prev, [key]: "Select a label." }));
        return;
      }
    }

    const pending = aiPendingOverrides?.[key];
    if (!pending) {
      clearAiDraftForKey(key);
      setAiEditingKey(null);
      setAiFieldErrors((prev) => ({ ...prev, [key]: null }));
      return;
    }

    if (pending === null) {
      persistAiOverride(key, null);
      return;
    }

    if (pending?.label !== undefined) {
      const label = String(pending.label || "").trim();
      if (!label) {
        setAiFieldErrors((prev) => ({ ...prev, [key]: "Select a label." }));
        return;
      }
      persistAiOverride(key, { label });
      return;
    }

    if (pending?.value !== undefined) {
      const parsed = parseNumericInput(pending.value);
      if (parsed === null) {
        setAiFieldErrors((prev) => ({ ...prev, [key]: "Enter a valid number." }));
        return;
      }
      persistAiOverride(key, { value: parsed });
      return;
    }

    persistAiOverride(key, null);
  }, [aiDraftOverrides, aiPendingOverrides, clearAiDraftForKey, persistAiOverride]);

  const handleAiClearOverride = useCallback((key) => {
    if (!key) return;
    setAiDraftOverrides((prev) => ({ ...prev, [key]: null }));
    setAiFieldErrors((prev) => ({ ...prev, [key]: null }));
    persistAiOverride(key, null);
  }, [persistAiOverride]);

  // ---- Derived booleans & controls -----------------------------------------
  const isPolling = useMemo(() => {
    const data = [
      panechoEchoprimeResultsQuery.data, 
      dynamicMeasurementsResultsQuery.data,
      llmReportResultsQuery.data,
    ];
    return data.some(
      (data) => data?.isPending || (data?.status === 202 && data?.data?.status === "pending")
    );
  }, [
    panechoEchoprimeResultsQuery.data,
    dynamicMeasurementsResultsQuery.data,
    llmReportResultsQuery.data,
  ]);

  const firstError =
    panechoEchoprimeResultsQuery.error ??
    dynamicMeasurementsResultsQuery.error ??
    llmReportResultsQuery.error ??
    studyMetaQuery.error ??
    null;

  const hasMeasurements = Boolean(panechoEchoprimeResults || dynamicMeasurementsResults);
  const overrideMeta = useMemo(() => {
    const overrides = panechoEchoprimeResults?.overrides || {};
    const overridesUpdatedAt = panechoEchoprimeResults?.overrides_updated_at;
    const hasOverrides = Object.keys(overrides).length > 0;
    let latestOverrideAt = null;

    if (overridesUpdatedAt) {
      const overrideTs = new Date(overridesUpdatedAt).getTime();
      if (Number.isFinite(overrideTs)) {
        latestOverrideAt = new Date(overrideTs).toISOString();
      }
    }

    if (!latestOverrideAt) {
      const entries = Object.values(overrides);
      const timestamps = entries
        .map((entry) => entry?.edited_at)
        .filter(Boolean)
        .map((ts) => new Date(ts).getTime())
        .filter((ts) => Number.isFinite(ts));
      latestOverrideAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
    }

    return { hasOverrides, latestOverrideAt };
  }, [panechoEchoprimeResults]);

  const aiShowLoading = useMemo(
    () => panEchoEchoprimeState !== "ready" && !aiActiveResults,
    [aiActiveResults, panEchoEchoprimeState]
  );

  const anyLoading = useMemo(
    () =>
      ["loading", "pending"].includes(panEchoEchoprimeState) ||
      ["loading", "pending"].includes(dynamicMeasurementsState) ||
      ["loading", "pending"].includes(llmReportState),
    [panEchoEchoprimeState, dynamicMeasurementsState, llmReportState]
  );

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
      hasOverrides: overrideMeta.hasOverrides,
      latestOverrideAt: overrideMeta.latestOverrideAt,

      aiMeasurements: {
        state: panEchoEchoprimeState,
        showLoading: aiShowLoading,
        isEmpty: aiIsEmpty,
        totalMeasurements: aiTotalMeasurements,
        mainMeasurements: aiMainMeasurements,
        Measurements: aiMeasurementsSections,
        hasMainMeasurements: aiHasMainMeasurements,
        hasMeasurements: aiHasMeasurements,
        editingKey: aiEditingKey,
        draftOverrides: aiDraftOverrides,
        fieldErrors: aiFieldErrors,
        savingKey: aiSavingKey,
        onStartEdit: handleAiStartEdit,
        onStopEdit: handleAiStopEdit,
        onChangeValue: handleAiChangeValue,
        onChangeLabel: handleAiChangeLabel,
        onClearOverride: handleAiClearOverride,
      },

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
      overrideMeta.hasOverrides,
      overrideMeta.latestOverrideAt,
      aiShowLoading,
      aiIsEmpty,
      aiTotalMeasurements,
      aiMainMeasurements,
      aiMeasurementsSections,
      aiHasMainMeasurements,
      aiHasMeasurements,
      aiEditingKey,
      aiDraftOverrides,
      aiFieldErrors,
      aiSavingKey,
      handleAiStartEdit,
      handleAiStopEdit,
      handleAiChangeValue,
      handleAiChangeLabel,
      handleAiClearOverride,
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
