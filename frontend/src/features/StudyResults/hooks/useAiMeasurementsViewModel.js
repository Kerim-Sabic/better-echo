import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INDEXABLE_KEYS } from "../helpers/aiMeasurementsConstants";
import { applyIndexedMeasurementDisplay } from "../helpers/applyIndexedMeasurementDisplay";
import { updatePanechoEchoprimeOverrides } from "../../../api/results/PanechoEchoprimeResultsApi";

const EMPTY_OBJ = {};
const EMPTY_DISPLAY = {
  mainMeasurements: [],
  Measurements: [],
  hasMainMeasurements: false,
  hasMeasurements: false,
  totalMeasurements: 0,
};

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
  patientHeightCm,
  patientWeightKg,
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

  const editBaselines = useMemo(
    () => activeResults?.edit_baselines || EMPTY_OBJ,
    [activeResults?.edit_baselines]
  );

  const backendDisplay = useMemo(
    () => activeResults?.display || EMPTY_DISPLAY,
    [activeResults?.display]
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
      const baseline = editBaselines[key];
      if (!baseline && !savedOverrides?.[key]) return;
      if (entry?.label !== undefined) {
        const nextLabel = String(entry.label || "").trim();
        const baselineLabel = savedOverrides?.[key]?.label ?? baseline?.label ?? "";
        if (nextLabel && nextLabel !== baselineLabel) {
          pending[key] = { label: nextLabel };
        }
        return;
      }
      if (entry?.value !== undefined) {
        const parsed = parseNumericInput(entry.value);
        const baselineRaw = savedOverrides?.[key]?.value ?? baseline?.rawValue ?? null;
        const normalizedBaseline = (
          isIndexedMode &&
          bsa &&
          INDEXABLE_KEYS.has(key) &&
          baselineRaw !== null
        )
          ? Number(baselineRaw) / bsa
          : baselineRaw;
        if (
          parsed === null ||
          normalizedBaseline === null ||
          Number(parsed) !== Number(normalizedBaseline)
        ) {
          pending[key] = { value: entry.value };
        }
      }
    });
    return pending;
  }, [draftOverrides, editBaselines, savedOverrides, isIndexedMode, bsa]);

  const {
    mainMeasurements,
    Measurements: measurementSections,
    hasMainMeasurements,
    hasMeasurements,
    totalMeasurements,
  } = useMemo(
    () => applyIndexedMeasurementDisplay(backendDisplay, { isIndexedMode, bsa }),
    [backendDisplay, isIndexedMode, bsa]
  );

  const isEmpty = !hasMainMeasurements && !hasMeasurements;

  // ---- Edit handlers -------------------------------------------------------
  const handleStartEdit = useCallback((item) => {
    if (!item || !item.key) return;
    setEditingKey(item.key);
    setFieldErrors((prev) => ({ ...prev, [item.key]: null }));
    setDraftOverrides((prev) => {
      if (prev[item.key] !== undefined) return prev;
      const baseline = editBaselines[item.key];
      if (!baseline && item.rawValue === undefined) return prev;
      if (item.editType === "label") {
        const currentLabel = savedOverrides?.[item.key]?.label ?? baseline?.label ?? "";
        return { ...prev, [item.key]: { label: currentLabel } };
      }
      const baseRawValue = savedOverrides?.[item.key]?.value ?? baseline?.rawValue;
      const currentValue =
        isIndexedMode && bsa && INDEXABLE_KEYS.has(item.key) && baseRawValue !== null && baseRawValue !== undefined
          ? Number(baseRawValue) / bsa
          : baseRawValue;
      return {
        ...prev,
        [item.key]: {
          value: currentValue !== null && currentValue !== undefined ? String(currentValue) : "",
        },
      };
    });
  }, [bsa, editBaselines, isIndexedMode, savedOverrides]);

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
