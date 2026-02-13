import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildAiMeasurementsProps } from "../helpers/buildAiMeasurementsProps";
import { INDEXABLE_KEYS } from "../helpers/aiMeasurementsConstants";
import { updatePanechoEchoprimeOverrides } from "../../../api/orchestration_apis/PanechoEchoprimeResultsApi";

const EMPTY_OBJ = {};

const parseNumericInput = (rawValue) => {
  const cleaned = String(rawValue ?? "").replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export function useAiMeasurementsViewModel({
  studyUid,
  panechoEchoprimeResults,
  panEchoEchoprimeState,
  studyInstanceKey,
  patientSex,
  patientHeightCm,
  patientWeightKg,
  heartRateBpm,
  refresh,
}) {
  // ---- Local UI state ------------------------------------------------------
  const [editingKey, setEditingKey] = useState(null);
  const [draftOverrides, setDraftOverrides] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [cachedResults, setCachedResults] = useState(null);
  const [isIndexedMode, setIsIndexedMode] = useState(false);
  const indexedInitializedRef = useRef(false);
  const cacheKeyRef = useRef(null);
  const activeCacheKey = studyInstanceKey ?? studyUid ?? null;

  // ---- Cache & source selection --------------------------------------------
  useEffect(() => {
    if (cacheKeyRef.current === activeCacheKey) return;
    cacheKeyRef.current = activeCacheKey;
    setCachedResults(null);
    setDraftOverrides({});
    setEditingKey(null);
    setFieldErrors({});
    setSavingKey(null);
    setIsIndexedMode(false);
    indexedInitializedRef.current = false;
  }, [activeCacheKey]);

  useEffect(() => {
    if (panechoEchoprimeResults) {
      setCachedResults(panechoEchoprimeResults);
    }
  }, [panechoEchoprimeResults]);

  const activeResults = panechoEchoprimeResults || cachedResults;

  const bsa = useMemo(() => {
    const height = Number(patientHeightCm);
    const weight = Number(patientWeightKg);
    if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) {
      return null;
    }
    return Math.sqrt((height * weight) / 3600);
  }, [patientHeightCm, patientWeightKg]);

  const canIndex = Boolean(bsa);

  useEffect(() => {
    if (!canIndex) {
      setIsIndexedMode(false);
      return;
    }
    if (!indexedInitializedRef.current) {
      setIsIndexedMode(true);
      indexedInitializedRef.current = true;
    }
  }, [canIndex]);

  const handleSetIndexedMode = useCallback((nextMode) => {
    if (!canIndex) {
      setIsIndexedMode(false);
      return;
    }
    setIsIndexedMode(Boolean(nextMode));
  }, [canIndex]);

  const handleToggleIndexed = useCallback(() => {
    if (!canIndex) return;
    setIsIndexedMode((prev) => !prev);
  }, [canIndex]);

  // ---- Derived overrides / display ----------------------------------------
  const savedOverrides = useMemo(
    () => activeResults?.overrides || EMPTY_OBJ,
    [activeResults?.overrides]
  );

  const integratedTasks = useMemo(
    () => activeResults?.integrated_tasks || EMPTY_OBJ,
    [activeResults?.integrated_tasks]
  );

  const pendingOverrides = useMemo(() => {
    const pending = {};
    Object.entries(draftOverrides).forEach(([key, entry]) => {
      if (entry === null) {
        if (savedOverrides?.[key]) {
          pending[key] = null;
        }
        return;
      }
      const task = integratedTasks[key];
      if (!task) return;
      if (entry?.label !== undefined) {
        const nextLabel = String(entry.label || "").trim();
        const baseline = savedOverrides?.[key]?.label ?? task.integrated_label ?? "";
        if (nextLabel && nextLabel !== baseline) {
          pending[key] = { label: nextLabel };
        }
        return;
      }
      if (entry?.value !== undefined) {
        const parsed = parseNumericInput(entry.value);
        const baselineRaw = savedOverrides?.[key]?.value ?? task.integrated_value ?? null;
        const baseline = (isIndexedMode && bsa && INDEXABLE_KEYS.has(key) && baselineRaw !== null)
          ? Number(baselineRaw) / bsa
          : baselineRaw;
        if (parsed === null || baseline === null || Number(parsed) !== Number(baseline)) {
          pending[key] = { value: entry.value };
        }
      }
    });
    return pending;
  }, [draftOverrides, integratedTasks, savedOverrides, isIndexedMode, bsa]);

  const effectiveOverrides = useMemo(() => {
    const merged = { ...savedOverrides };
    Object.entries(pendingOverrides).forEach(([key, entry]) => {
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
          const rawValue = (isIndexedMode && bsa && INDEXABLE_KEYS.has(key))
            ? parsed * bsa
            : parsed;
          merged[key] = { ...(merged[key] || {}), value: parsed };
          merged[key].value = rawValue;
        }
      }
    });
    return merged;
  }, [pendingOverrides, savedOverrides, isIndexedMode, bsa]);

  const { mainMeasurements, Measurements: measurementSections } = useMemo(
    () => buildAiMeasurementsProps(activeResults, effectiveOverrides, patientSex, {
      isIndexedMode,
      bsa,
      heartRateBpm,
    }),
    [activeResults, effectiveOverrides, patientSex, isIndexedMode, bsa, heartRateBpm]
  );

  const hasMainMeasurements = Array.isArray(mainMeasurements) && mainMeasurements.length > 0;
  const hasMeasurements = Array.isArray(measurementSections) && measurementSections.length > 0;
  const totalMeasurements =
    (hasMainMeasurements ? mainMeasurements.length : 0) +
    (hasMeasurements
      ? measurementSections.reduce((sum, m) => sum + (m.items?.length || 0), 0)
      : 0);
  const isEmpty = !hasMainMeasurements && !hasMeasurements;

  // ---- Edit handlers -------------------------------------------------------
  const handleStartEdit = useCallback((item) => {
    if (!item || !item.key) return;
    setEditingKey(item.key);
    setFieldErrors((prev) => ({ ...prev, [item.key]: null }));
    setDraftOverrides((prev) => {
      if (prev[item.key] !== undefined) return prev;
      const task = integratedTasks[item.key];
      if (!task && item.rawNumericValue === undefined) return prev;
      if (item.editType === "label") {
        const currentLabel = effectiveOverrides?.[item.key]?.label ?? task.integrated_label ?? "";
        return { ...prev, [item.key]: { label: currentLabel } };
      }
      const currentValue = item.editValue ?? effectiveOverrides?.[item.key]?.value ?? task?.integrated_value;
      return {
        ...prev,
        [item.key]: {
          value: currentValue !== null && currentValue !== undefined ? String(currentValue) : "",
        },
      };
    });
  }, [effectiveOverrides, integratedTasks]);

  const handleChangeValue = useCallback((key, nextValue) => {
    setDraftOverrides((prev) => ({ ...prev, [key]: { value: nextValue } }));
    setFieldErrors((prev) => ({ ...prev, [key]: null }));
  }, []);

  const handleChangeLabel = useCallback((key, nextLabel) => {
    setDraftOverrides((prev) => ({ ...prev, [key]: { label: nextLabel } }));
    setFieldErrors((prev) => ({ ...prev, [key]: null }));
  }, []);

  const clearDraftForKey = useCallback((key) => {
    setDraftOverrides((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const persistOverride = useCallback(async (key, payload) => {
    if (!studyUid) return;
    setSavingKey(key);
    setFieldErrors((prev) => ({ ...prev, [key]: null }));
    try {
      await updatePanechoEchoprimeOverrides(studyUid, { [key]: payload });
      clearDraftForKey(key);
      setEditingKey(null);
      refresh();
    } catch (err) {
      setFieldErrors((prev) => ({ ...prev, [key]: "Failed to save override." }));
    } finally {
      setSavingKey(null);
    }
  }, [clearDraftForKey, refresh, studyUid]);

  const handleStopEdit = useCallback((key) => {
    if (!key) {
      setEditingKey(null);
      return;
    }

    const draft = draftOverrides?.[key];
    if (draft?.label !== undefined) {
      const label = String(draft.label || "").trim();
      if (!label) {
        setFieldErrors((prev) => ({ ...prev, [key]: "Select a label." }));
        return;
      }
    }

    const pending = pendingOverrides?.[key];
    if (!pending) {
      clearDraftForKey(key);
      setEditingKey(null);
      setFieldErrors((prev) => ({ ...prev, [key]: null }));
      return;
    }

    if (pending === null) {
      persistOverride(key, null);
      return;
    }

    if (pending?.label !== undefined) {
      const label = String(pending.label || "").trim();
      if (!label) {
        setFieldErrors((prev) => ({ ...prev, [key]: "Select a label." }));
        return;
      }
      persistOverride(key, { label });
      return;
    }

    if (pending?.value !== undefined) {
      const parsed = parseNumericInput(pending.value);
      if (parsed === null) {
        setFieldErrors((prev) => ({ ...prev, [key]: "Enter a valid number." }));
        return;
      }
      let valueToPersist = parsed;
      if (isIndexedMode && bsa && INDEXABLE_KEYS.has(key)) {
        valueToPersist = parsed * bsa;
      }
      persistOverride(key, { value: valueToPersist });
      return;
    }

    persistOverride(key, null);
  }, [bsa, clearDraftForKey, draftOverrides, isIndexedMode, pendingOverrides, persistOverride]);

  const handleClearOverride = useCallback((key) => {
    if (!key) return;
    setDraftOverrides((prev) => ({ ...prev, [key]: null }));
    setFieldErrors((prev) => ({ ...prev, [key]: null }));
    persistOverride(key, null);
  }, [persistOverride]);

  // ---- Derived output ------------------------------------------------------
  const showLoading = useMemo(
    () => panEchoEchoprimeState !== "ready" && !activeResults,
    [activeResults, panEchoEchoprimeState]
  );

  return {
    state: panEchoEchoprimeState,
    showLoading,
    isEmpty,
    totalMeasurements,
    mainMeasurements,
    Measurements: measurementSections,
    hasMainMeasurements,
    hasMeasurements,
    isIndexedMode,
    canIndex,
    bsa,
    editingKey,
    draftOverrides,
    fieldErrors,
    savingKey,
    onSetIndexedMode: handleSetIndexedMode,
    onToggleIndexed: handleToggleIndexed,
    onStartEdit: handleStartEdit,
    onStopEdit: handleStopEdit,
    onChangeValue: handleChangeValue,
    onChangeLabel: handleChangeLabel,
    onClearOverride: handleClearOverride,
  };
}
