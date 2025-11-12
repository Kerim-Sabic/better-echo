import { useMemo } from "react";
import { useCombinedResultsQuery } from "./useCombinedResultsQuery";
import { useDynamicMeasurementsResultsQuery } from "./useDynamicMeasurementsResultsQuery";
import { useLlmReportResultsQuery } from "./useLlmReportResultsQuery";

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
 *   // controls
 *   isPolling: boolean,
 *   refresh: () => void
 * }}
 */
export function useStudyResults(studyUid) {
  // ---- Queries --------------------------------------------------------------
  const combinedResultsQuery = useCombinedResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const dynamicMeasurementsResultsQuery = useDynamicMeasurementsResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });

  const llmReportResultsQuery = useLlmReportResultsQuery(studyUid, {
    enabled: Boolean(studyUid),
  });
  // Future-ready: just add new resources here (e.g., useReportQuery)
  // Each resource should expose { data: {status, isPending, isComplete, results, ...}, isError, isFetching, refetch }
  const resources = [
    {
      key: "panechoEchoprime",
      query: combinedResultsQuery,
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
    if (noDataYet) return "loading";

    const all404 = datas.length > 0 && datas.every((data) => data?.status === 404);
    if (all404) return "not_found";

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
  }, [studyUid, resources]);

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
  const panEchoEchoprimeState = useMemo(
    () => computeState(combinedResultsQuery),
    [combinedResultsQuery.data, combinedResultsQuery.isFetching, combinedResultsQuery.isError]
  );

  const dynamicMeasurementsState = useMemo(
    () => computeState(dynamicMeasurementsResultsQuery),
    [dynamicMeasurementsResultsQuery.data, dynamicMeasurementsResultsQuery.isFetching, dynamicMeasurementsResultsQuery.isError]
  );

  const llmReportState = useMemo(
    () => computeState(llmReportResultsQuery),
    [llmReportResultsQuery.data, llmReportResultsQuery.isFetching, llmReportResultsQuery.isError]
  );

  // ---- Normalize outputs per resource --------------------------------------
  const panechoEchoprimeResults = useMemo(() => {
    const response = combinedResultsQuery.data;
    if (!response) return null;
    // prefer pre-computed results from select()
    if (response.results) return response.results;
    // fallback to raw API shape
    if (response.status === 200 && response.data?.status === "complete") {
      return response.data.panecho_echoprime_results ?? null;
    }
    return null;
  }, [combinedResultsQuery.data]);

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
      combinedResultsQuery.data, 
      dynamicMeasurementsResultsQuery.data,
      llmReportResultsQuery.data,
    ];
    return data.some(
      (data) => data?.isPending || (data?.status === 202 && data?.data?.status === "pending")
    );
  }, [
    combinedResultsQuery.data,
    dynamicMeasurementsResultsQuery.data,
    llmReportResultsQuery.data,
  ]);

  const firstError =
    combinedResultsQuery.error ??
    dynamicMeasurementsResultsQuery.error ??
    llmReportResultsQuery.error ??
    null;

  const hasMeasurements = Boolean(panechoEchoprimeResults || dynamicMeasurementsResults);

  // ---- Compose UI-facing view model ----------------------------------------
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

      // data buckets
      panechoEchoprimeResults,
      dynamicMeasurementsResults,
      llmReportResults,

      hasMeasurements,

      // controls
      isPolling,
      refresh: () => {
        combinedResultsQuery.refetch();
        dynamicMeasurementsResultsQuery.refetch();
        llmReportResultsQuery.refetch();
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
      isPolling,
      combinedResultsQuery.refetch,
      dynamicMeasurementsResultsQuery.refetch,
      llmReportResultsQuery.refetch,

      panEchoEchoprimeState,
      dynamicMeasurementsState,
      llmReportState,
    ]
  );

  return viewModel;
}
