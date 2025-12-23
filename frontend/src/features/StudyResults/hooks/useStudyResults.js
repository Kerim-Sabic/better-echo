import { useMemo } from "react";
import { usePanechoEchoprimeResultsQuery } from "./usePanechoEchoprimeResultsQuery";
import { useDynamicMeasurementsResultsQuery } from "./useDynamicMeasurementsResultsQuery";
import { useLlmReportResultsQuery } from "./useLlmReportResultsQuery";
import { useStudyMetaQuery } from "./useStudyMetaQuery";

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
 *   // controls
 *   isPolling: boolean,
 *   refresh: () => void
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
    const entries = Object.values(overrides);
    if (!entries.length) {
      return { hasOverrides: false, latestOverrideAt: null };
    }
    const timestamps = entries
      .map((entry) => entry?.edited_at)
      .filter(Boolean)
      .map((ts) => new Date(ts).getTime())
      .filter((ts) => Number.isFinite(ts));
    const latest = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
    return { hasOverrides: true, latestOverrideAt: latest };
  }, [panechoEchoprimeResults]);

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
      patientName: studyMetaQuery.data?.patientName ?? null,

      // data buckets
      panechoEchoprimeResults,
      dynamicMeasurementsResults,
      llmReportResults,

      hasMeasurements,
      hasOverrides: overrideMeta.hasOverrides,
      latestOverrideAt: overrideMeta.latestOverrideAt,

      // controls
      isPolling,
      refresh: () => {
        panechoEchoprimeResultsQuery.refetch();
        dynamicMeasurementsResultsQuery.refetch();
        if (isLLMEnabled) {
          llmReportResultsQuery.refetch();
        }
        studyMetaQuery.refetch();
        // add future refetches here (e.g., reportQuery.refetch())
      },
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
      isPolling,
      panechoEchoprimeResultsQuery.refetch,
      dynamicMeasurementsResultsQuery.refetch,
      llmReportResultsQuery.refetch,
      studyMetaQuery.refetch,
      studyMetaQuery.data?.patientName,
      isLLMEnabled,

      panEchoEchoprimeState,
      dynamicMeasurementsState,
      llmReportState,
    ]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  return viewModel;
}
