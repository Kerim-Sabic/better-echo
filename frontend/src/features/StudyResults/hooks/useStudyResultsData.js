import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanechoEchoprimeResultsQuery } from "./queries/usePanechoEchoprimeResultsQuery";
import { useDynamicMeasurementsResultsQuery } from "./queries/useDynamicMeasurementsResultsQuery";
import { useLlmReportResultsQuery } from "./queries/useLlmReportResultsQuery";
import { useStudyMetaQuery } from "./queries/useStudyMetaQuery";
import { usePipelineStatusQuery } from "./queries/usePipelineStatusQuery";
import { printMeasurements } from "../helpers/printMeasurements";
import { startStudyPipeline } from "../../../api/pipeline/PipelineApi";

const FAILED_PIPELINE_STATUS = "failed";
const COMPLETED_PIPELINE_STATUS = "completed";

function isPendingObserverResponse(data) {
  return Boolean(data?.isPending || (data?.status === 202 && data?.data?.status === "pending"));
}

function isCompleteObserverResponse(data) {
  return Boolean(data?.isComplete || (data?.status === 200 && data?.data?.status === "complete"));
}

function isFailedObserverResponse(data) {
  return Boolean(data?.isFailed || (data?.status === 200 && data?.data?.status === "failed"));
}

export function useStudyResultsData(studyUid) {
  // ---- Check if LLM is enabled at build time ------------------------------
  const isLLMEnabled = process.env.REACT_APP_ENABLE_LLM === "true";

  // ---- Local UI state ------------------------------------------------------
  const [pipelineStartError, setPipelineStartError] = useState(null);
  const autoStartAttemptRef = useRef(null);

  // ---- Study metadata ------------------------------------------------------
  const studyMetaQuery = useStudyMetaQuery(studyUid, { enabled: Boolean(studyUid) });

  // ---- Queue status (backend-owned orchestration truth) -------------------
  const pipelineStatusQuery = usePipelineStatusQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  // ---- Observer result queries --------------------------------------------
  const panechoEchoprimeResultsQuery = usePanechoEchoprimeResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const dynamicMeasurementsResultsQuery = useDynamicMeasurementsResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const llmReportResultsQuery = useLlmReportResultsQuery(studyUid, {
    enabled: Boolean(studyUid) && isLLMEnabled,
  });

  const resultResources = [
    panechoEchoprimeResultsQuery,
    dynamicMeasurementsResultsQuery,
    llmReportResultsQuery,
  ];

  const resultDatas = resultResources.map(resource => resource.data);

  // ---- Derived orchestration flags ----------------------------------------
  const hasAnyCompleteResult = resultDatas.some(isCompleteObserverResponse);
  const hasAnyPendingResult = resultDatas.some(isPendingObserverResponse);
  const hasAnyFailedResult = resultDatas.some(isFailedObserverResponse);
  const allResultsNotFound = resultDatas.length > 0 && resultDatas.every(data => data?.status === 404);

  const pipelineData = pipelineStatusQuery.data;
  const hasPipelineJob = Boolean(pipelineData?.hasJob);
  const pipelineStatus = pipelineData?.pipelineStatus ?? null;
  const isPipelineActive = Boolean(pipelineData?.isActive);
  const isPipelineFailed = pipelineStatus === FAILED_PIPELINE_STATUS;

  // ---- One-time auto-start fallback for studies without queue jobs --------
  useEffect(() => {
    if (!studyUid) {
      autoStartAttemptRef.current = null;
      return;
    }

    if (autoStartAttemptRef.current === studyUid) {
      return;
    }

    if (studyMetaQuery.isLoading || pipelineStatusQuery.isLoading) {
      return;
    }

    if (hasPipelineJob) {
      return;
    }

    if (hasAnyCompleteResult || hasAnyFailedResult) {
      return;
    }

    autoStartAttemptRef.current = studyUid;
    setPipelineStartError(null);

    startStudyPipeline(studyUid, {
      run_mode: "upload_preview",
      cleanup_scope: "none",
      uploaded_instance_uids: [],
    })
      .then(() => {
        pipelineStatusQuery.refetch();
        panechoEchoprimeResultsQuery.refetch();
        dynamicMeasurementsResultsQuery.refetch();
        if (isLLMEnabled) {
          llmReportResultsQuery.refetch();
        }
      })
      .catch(error => {
        console.error("Failed to auto-start study pipeline", error);
        setPipelineStartError(error);
      });
  }, [
    studyUid,
    studyMetaQuery.isLoading,
    pipelineStatusQuery,
    hasPipelineJob,
    hasAnyCompleteResult,
    hasAnyFailedResult,
    panechoEchoprimeResultsQuery,
    dynamicMeasurementsResultsQuery,
    llmReportResultsQuery,
    isLLMEnabled,
  ]);

  // ---- Aggregate page-level state -----------------------------------------
  const pageState = useMemo(() => {
    if (!studyUid) return "not_found";

    const isStudyNotFound = studyMetaQuery.error?.response?.status === 404;
    if (isStudyNotFound || allResultsNotFound) return "not_found";

    if (studyMetaQuery.isLoading) return "loading";
    if (studyMetaQuery.isError) return "error";

    if (hasAnyCompleteResult) return "ready";

    if (isPipelineFailed || hasAnyFailedResult) return "error";

    if (isPipelineActive || hasAnyPendingResult) return "pending";

    if (hasPipelineJob && pipelineStatus === COMPLETED_PIPELINE_STATUS) {
      // Queue completed but observer payload has not been read as complete yet.
      return "pending";
    }

    if (!hasPipelineJob) {
      // Auto-start may still be in-flight; keep a neutral pending state.
      return "pending";
    }

    if (pipelineStatusQuery.isFetching) return "loading";
    if (pipelineStatusQuery.isError) return "error";

    return "loading";
  }, [
    studyUid,
    studyMetaQuery.error,
    studyMetaQuery.isLoading,
    studyMetaQuery.isError,
    allResultsNotFound,
    hasAnyCompleteResult,
    hasAnyPendingResult,
    hasAnyFailedResult,
    hasPipelineJob,
    isPipelineActive,
    isPipelineFailed,
    pipelineStatus,
    pipelineStatusQuery.isFetching,
    pipelineStatusQuery.isError,
  ]);

  // ---- Helper to compute per-observer-query state -------------------------
  const computeState = query => {
    const data = query.data;

    if (!studyUid) return "not_found";
    if (!data) return "loading";
    if (data.status === 404) return "not_found";
    if (isFailedObserverResponse(data)) return "error";
    if (query.isFetching) return "loading";
    if (isPendingObserverResponse(data)) return "pending";
    if (isCompleteObserverResponse(data)) return "ready";
    if (query.isError) return "error";

    return "error";
  };

  // ---- Individual states for each observer query --------------------------
  /* eslint-disable react-hooks/exhaustive-deps */
  const panEchoEchoprimeState = useMemo(
    () => computeState(panechoEchoprimeResultsQuery),
    [
      panechoEchoprimeResultsQuery.data,
      panechoEchoprimeResultsQuery.isFetching,
      panechoEchoprimeResultsQuery.isError,
    ]
  );

  const dynamicMeasurementsState = useMemo(
    () => computeState(dynamicMeasurementsResultsQuery),
    [
      dynamicMeasurementsResultsQuery.data,
      dynamicMeasurementsResultsQuery.isFetching,
      dynamicMeasurementsResultsQuery.isError,
    ]
  );

  const llmReportState = useMemo(() => {
    if (!isLLMEnabled) return undefined;
    return computeState(llmReportResultsQuery);
  }, [
    isLLMEnabled,
    llmReportResultsQuery.data,
    llmReportResultsQuery.isFetching,
    llmReportResultsQuery.isError,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // ---- Normalize outputs per observer resource ----------------------------
  const panechoEchoprimeResults = useMemo(() => {
    const response = panechoEchoprimeResultsQuery.data;
    if (!response) return null;
    if (response.results) return response.results;
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
  const patientSex = studyMetaQuery.data?.patientSex ?? null;
  const patientHeightCm = studyMetaQuery.data?.patientHeightCm ?? null;
  const patientWeightKg = studyMetaQuery.data?.patientWeightKg ?? null;
  const heartRateBpm = studyMetaQuery.data?.heartRateBpm ?? null;

  // ---- Refresh / print -----------------------------------------------------
  const refreshAll = useCallback(() => {
    pipelineStatusQuery.refetch();
    panechoEchoprimeResultsQuery.refetch();
    dynamicMeasurementsResultsQuery.refetch();
    if (isLLMEnabled) {
      llmReportResultsQuery.refetch();
    }
    studyMetaQuery.refetch();
  }, [
    pipelineStatusQuery,
    panechoEchoprimeResultsQuery,
    dynamicMeasurementsResultsQuery,
    llmReportResultsQuery,
    studyMetaQuery,
    isLLMEnabled,
  ]);

  const handlePrint = useCallback(
    async (options = {}) => {
      if (!studyUid) return;
      const result = await printMeasurements({
        panechoEchoprimeResults,
        patientName,
        patientSex,
        studyUID: studyUid,
        heartRateBpm,
        ...options,
      });
      if (!result?.ok) {
        if (result?.reason === "no_measurements") {
          alert("No measurements to print.");
          return;
        }
        console.warn("Failed to prepare print", result?.error);
      }
    },
    [panechoEchoprimeResults, patientName, patientSex, studyUid, heartRateBpm]
  );

  // ---- Derived booleans & controls ----------------------------------------
  const isPolling = useMemo(() => {
    return isPipelineActive || resultDatas.some(isPendingObserverResponse);
  }, [isPipelineActive, resultDatas]);

  const firstError =
    pipelineStartError ??
    pipelineStatusQuery.error ??
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
        .map(entry => entry?.edited_at)
        .filter(Boolean)
        .map(ts => new Date(ts).getTime())
        .filter(ts => Number.isFinite(ts));
      latestOverrideAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
    }

    return { hasOverrides, latestOverrideAt };
  }, [panechoEchoprimeResults]);

  const anyLoading = useMemo(
    () =>
      isPipelineActive ||
      ["loading", "pending"].includes(panEchoEchoprimeState) ||
      ["loading", "pending"].includes(dynamicMeasurementsState) ||
      ["loading", "pending"].includes(llmReportState),
    [isPipelineActive, panEchoEchoprimeState, dynamicMeasurementsState, llmReportState]
  );

  return {
    state: pageState,
    error: firstError,
    panEchoEchoprimeState,
    dynamicMeasurementsState,
    llmReportState,
    pipelineStatus,
    hasPipelineJob,
    pipelineJobId: pipelineData?.pipeline?.job_id ?? null,
    studyUID: studyUid ?? null,
    panechoEchoprimeResults,
    dynamicMeasurementsResults,
    llmReportResults,
    hasMeasurements,
    hasOverrides: overrideMeta.hasOverrides,
    latestOverrideAt: overrideMeta.latestOverrideAt,
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
  };
}
