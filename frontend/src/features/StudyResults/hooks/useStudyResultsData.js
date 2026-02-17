import { useCallback, useMemo } from "react";
import { usePanechoEchoprimeResultsQuery } from "./queries/usePanechoEchoprimeResultsQuery";
import { useDynamicMeasurementsResultsQuery } from "./queries/useDynamicMeasurementsResultsQuery";
import { useLlmReportResultsQuery } from "./queries/useLlmReportResultsQuery";
import { useStudyMetaQuery } from "./queries/useStudyMetaQuery";
import { printMeasurements } from "../helpers/printMeasurements";

export function useStudyResultsData(studyUid) {
  // ---- Check if LLM is enabled at build time ------------------------------
  const isLLMEnabled = process.env.REACT_APP_ENABLE_LLM === "true";

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
    enabled: Boolean(studyUid) && isLLMEnabled,
  });

  // Future-ready: just add new resources here (e.g., useReportQuery)
  // Each resource should expose { data: {status, isPending, isComplete, results, ...}, isError, isFetching, refetch }
  const resources = [
    {
      key: "panechoEchoprime",
      query: panechoEchoprimeResultsQuery,
    },
    {
      key: "dynamicMeasurements",
      query: dynamicMeasurementsResultsQuery,
    },
    {
      key: "llmReport",
      query: llmReportResultsQuery,
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

    const anyFailed = datas.some(
      (data) => data?.isFailed || (data?.status === 200 && data?.data?.status === "failed")
    );
    if (anyFailed) return "error";

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
    if (data.isFailed || (data.status === 200 && data.data?.status === "failed")) return "error";
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

  // ---- Refresh / print ------------------------------------------------------
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

  const handlePrint = useCallback(async (options = {}) => {
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
  }, [panechoEchoprimeResults, patientName, patientSex, studyUid, heartRateBpm]);

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

  const anyLoading = useMemo(
    () =>
      ["loading", "pending"].includes(panEchoEchoprimeState) ||
      ["loading", "pending"].includes(dynamicMeasurementsState) ||
      ["loading", "pending"].includes(llmReportState),
    [panEchoEchoprimeState, dynamicMeasurementsState, llmReportState]
  );

  return {
    state: pageState,
    error: firstError,
    panEchoEchoprimeState,
    dynamicMeasurementsState,
    llmReportState,
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
