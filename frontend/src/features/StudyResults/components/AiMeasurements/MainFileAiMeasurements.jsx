import React, { useMemo, useState } from "react";
import { buildAiMeasurementsProps } from "./buildAiMeasurementsProps";
import MainMeasurementsList from "./MainMeasurementsList";
import MeasurementsList from "./MeasurementsList";
import LoadingScreen from "../LoadingScreen";
import { updatePanechoEchoprimeOverrides } from "../../../../api/orchestration_apis/PanechoEchoprimeResultsApi";

/**
 * Dumb UI entry. Accepts raw results, maps them via buildAiProps,
 * then renders presentational lists.
 *
 * Props:
 * - state: string (loading state)
 * - panechoEchoprimeResults: object (raw results)
 */
const EMPTY_OBJ = {};

export default function MainFileAiMeasurements({ state, panechoEchoprimeResults, studyUID, onRefresh }) {
    const [editingKey, setEditingKey] = useState(null);
    const [draftOverrides, setDraftOverrides] = useState({});
    const [fieldErrors, setFieldErrors] = useState({});
    const [saveError, setSaveError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const savedOverrides = useMemo(
        () => panechoEchoprimeResults?.overrides || EMPTY_OBJ,
        [panechoEchoprimeResults?.overrides]
    );
    const integratedTasks = useMemo(
        () => panechoEchoprimeResults?.integrated_tasks || EMPTY_OBJ,
        [panechoEchoprimeResults?.integrated_tasks]
    );

    const parseNumericInput = (rawValue) => {
        const cleaned = String(rawValue ?? "").replace(/[^\d.-]/g, "");
        const parsed = Number.parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    };

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
                const baseline = savedOverrides?.[key]?.value ?? task.integrated_value ?? null;
                if (parsed === null || baseline === null || Number(parsed) !== Number(baseline)) {
                    pending[key] = { value: entry.value };
                }
            }
        });
        return pending;
    }, [draftOverrides, savedOverrides, integratedTasks]);

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
                    merged[key] = { ...(merged[key] || {}), value: parsed };
                }
            }
        });
        return merged;
    }, [savedOverrides, pendingOverrides]);

    const { mainMeasurements, Measurements } = buildAiMeasurementsProps(
        panechoEchoprimeResults,
        effectiveOverrides
    );

    const hasMainMeasurements = Array.isArray(mainMeasurements) && mainMeasurements.length > 0;
    const hasMeasurements = Array.isArray(Measurements) && Measurements.length > 0;

    if (state !== "ready") {
        return <LoadingScreen state={state} />;
    }

    if (!hasMainMeasurements && !hasMeasurements) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-6">
                <div className="relative">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 
            backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/20">
                        <svg
                            className="w-12 h-12 text-gray-400"
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <defs>
                                <linearGradient id="measurementGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#9333EA" />
                                    <stop offset="100%" stopColor="#06B6D4" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                stroke="url(#measurementGradient)"
                                strokeWidth="2"
                            />
                        </svg>
                    </div>
                </div>
                <div className="text-center space-y-2 max-w-xs">
                    <p className="text-base font-semibold text-gray-800 tracking-tight">No Measurements</p>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                        No AI measurements available for this study.
                    </p>
                </div>
            </div>
        );
    }

    const totalMeasurements =
        (hasMainMeasurements ? mainMeasurements.length : 0) +
        (hasMeasurements
            ? Measurements.reduce((sum, m) => sum + (m.items?.length || 0), 0)
            : 0);

    const hasUnsavedChanges = Object.keys(pendingOverrides).length > 0;

    const handleStartEdit = (item) => {
        if (!item || !item.key) return;
        setEditingKey(item.key);
        setSaveError(null);
        setFieldErrors((prev) => ({ ...prev, [item.key]: null }));
        setDraftOverrides((prev) => {
            if (prev[item.key] !== undefined) return prev;
            const task = integratedTasks[item.key];
            if (!task) return prev;
            if (item.editType === "label") {
                const currentLabel = effectiveOverrides?.[item.key]?.label ?? task.integrated_label ?? "";
                return { ...prev, [item.key]: { label: currentLabel } };
            }
            const currentValue = effectiveOverrides?.[item.key]?.value ?? task.integrated_value;
            return { ...prev, [item.key]: { value: currentValue !== null && currentValue !== undefined ? String(currentValue) : "" } };
        });
    };

    const handleChangeValue = (key, nextValue) => {
        setDraftOverrides((prev) => ({ ...prev, [key]: { value: nextValue } }));
        setFieldErrors((prev) => ({ ...prev, [key]: null }));
    };

    const handleChangeLabel = (key, nextLabel) => {
        setDraftOverrides((prev) => ({ ...prev, [key]: { label: nextLabel } }));
        setFieldErrors((prev) => ({ ...prev, [key]: null }));
    };

    const handleClearOverride = (key) => {
        setDraftOverrides((prev) => ({ ...prev, [key]: null }));
        setFieldErrors((prev) => ({ ...prev, [key]: null }));
    };

    const handleSaveAll = async () => {
        if (!studyUID) return;
        setIsSaving(true);
        setSaveError(null);
        const nextErrors = {};
        const payloadOverrides = {};

        Object.entries(pendingOverrides).forEach(([key, entry]) => {
            if (entry === null) {
                payloadOverrides[key] = null;
                return;
            }
            if (entry?.label !== undefined) {
                const label = String(entry.label || "").trim();
                if (!label) {
                    nextErrors[key] = "Select a label.";
                    return;
                }
                payloadOverrides[key] = { label };
                return;
            }
            if (entry?.value !== undefined) {
                const parsed = parseNumericInput(entry.value);
                if (parsed === null) {
                    nextErrors[key] = "Enter a valid number.";
                    return;
                }
                payloadOverrides[key] = { value: parsed };
                return;
            }
            payloadOverrides[key] = null;
        });

        if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors);
            setIsSaving(false);
            return;
        }

        try {
            await updatePanechoEchoprimeOverrides(studyUID, payloadOverrides);
            setDraftOverrides({});
            setEditingKey(null);
            setFieldErrors({});
            if (onRefresh) {
                onRefresh();
            }
        } catch (err) {
            setSaveError("Failed to save overrides. Please retry.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 p-6">
            {/* Header Section */}
            <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 
          backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-sm">
                    <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                    >
                        <defs>
                            <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#9333EA" />
                                <stop offset="100%" stopColor="#06B6D4" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                            stroke="url(#headerGradient)"
                            strokeWidth="2"
                        />
                    </svg>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-gray-800 tracking-tight">
                        AI Measurements
                    </h2>
                    <p className="text-xs text-gray-500 font-medium">
                        {totalMeasurements} measurement{totalMeasurements !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>

            {/* Measurements Sections */}
            {hasMainMeasurements && (
                <MainMeasurementsList
                    mainMeasurements={mainMeasurements}
                    editingKey={editingKey}
                    draftOverrides={draftOverrides}
                    fieldErrors={fieldErrors}
                    onStartEdit={handleStartEdit}
                    onStopEdit={() => setEditingKey(null)}
                    onChangeValue={handleChangeValue}
                    onClearOverride={handleClearOverride}
                />
            )}

            {hasMeasurements &&
                Measurements.map((items, idx) => (
                    <MeasurementsList
                        key={items.section || `section-${idx}`}
                        section={items.section}
                        items={items.items || []}
                        editingKey={editingKey}
                        draftOverrides={draftOverrides}
                        fieldErrors={fieldErrors}
                        onStartEdit={handleStartEdit}
                        onStopEdit={() => setEditingKey(null)}
                        onChangeValue={handleChangeValue}
                        onChangeLabel={handleChangeLabel}
                        onClearOverride={handleClearOverride}
                    />
                ))}

            {hasUnsavedChanges && (
                <div className="sticky bottom-0 mt-6">
                    <div className="flex items-center justify-between gap-4 rounded-2xl border bg-white/95 p-4 shadow-sm">
                        <div className="text-sm text-gray-600">
                            Unsaved changes
                            {saveError && (
                                <span className="ml-2 text-red-600">{saveError}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                className="px-3 py-1.5 rounded-xl border bg-white text-gray-600"
                                onClick={() => {
                                    setDraftOverrides({});
                                    setEditingKey(null);
                                    setFieldErrors({});
                                    setSaveError(null);
                                }}
                                disabled={isSaving}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-1.5 rounded-xl bg-gray-900 text-white"
                                onClick={handleSaveAll}
                                disabled={isSaving}
                            >
                                {isSaving ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
