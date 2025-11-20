import { useMemo } from "react";
import { useCombinedResultsQuery } from "./useCombinedResultsQuery";
import { useDynamicMeasurementsResultsQuery } from "./useDynamicMeasurementsResultsQuery";

/**
 * @returns {{
 *   state: "loading" | "pending" | "ready" | "not_found" | "error",
 *   error: unknown,
 *   studyUID: string | null,
 *   // data buckets
 *   panechoEchoprimeResults: any,         // PanEcho + EchoPrime combined results
 *   dynamicMeasurementsResults: any,      // Dynamic + Measurements combined results
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

    const dynamicMeasurementsQuery = useDynamicMeasurementsResultsQuery(studyUid, {
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
            query: dynamicMeasurementsQuery,
            extractResults: (resp) =>
                resp?.results ??
                (resp?.status === 200 && resp?.data?.status === "complete"
                    ? resp?.data?.dynamic_measurements_results ?? null
                    : null),
        },
        // {
        //   key: "report",
        //   query: useReportQuery(studyUid, { enabled: Boolean(studyUid) }),
        //   extractResults: (resp) => resp?.results ?? null,
        // },
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
        const response = dynamicMeasurementsQuery.data;
        if (!response) return null;
        if (response.results) return response.results;
        if (response.status === 200 && response.data?.status === "complete") {
            return response.data.dynamic_measurements_results ?? null;
        }
        return null;
    }, [dynamicMeasurementsQuery.data]);

    // ---- Derived booleans & controls -----------------------------------------
    const isPolling = useMemo(() => {
        const data = [combinedResultsQuery.data, dynamicMeasurementsQuery.data];
        return data.some(
            (data) => data?.isPending || (data?.status === 202 && data?.data?.status === "pending")
        );
    }, [combinedResultsQuery.data, dynamicMeasurementsQuery.data]);

    const firstError =
        combinedResultsQuery.error ??
        dynamicMeasurementsQuery.error ??
        null;

    const hasMeasurements = Boolean(panechoEchoprimeResults || dynamicMeasurementsResults);

    // ---- Compose UI-facing view model ----------------------------------------
    const viewModel = useMemo(
        () => ({
            state: pageState,
            error: firstError,

            // identifiers / header bits
            studyUID: studyUid ?? null,

            // data buckets
            panechoEchoprimeResults,
            dynamicMeasurementsResults,

            hasMeasurements,

            // controls
            isPolling,
            refresh: () => {
                combinedResultsQuery.refetch();
                dynamicMeasurementsQuery.refetch();
                // add future refetches here (e.g., reportQuery.refetch())
            },
        }),
        [
            pageState,
            firstError,
            studyUid,
            panechoEchoprimeResults,
            dynamicMeasurementsResults,
            hasMeasurements,
            isPolling,
            combinedResultsQuery.refetch,
            dynamicMeasurementsQuery.refetch,
        ]
    );

    return viewModel;
}
