import { useEffect, useMemo, useState } from "react";
import { listStudiesApi } from "../../../api/StudiesApi";
import { usePanechoEchoprimeResultsQuery } from "./usePanechoEchoprimeResultsQuery";
import { useDynamicMeasurementsResultsQuery } from "./useDynamicMeasurementsResultsQuery";

/**
 * @returns {{
 *   state: "loading" | "pending" | "ready" | "not_found" | "error",
 *   error: unknown,
 *
 *   panEchoEchoprimeState:     "loading" | "pending" | "ready" | "not_found" | "error",
 *   dynamicMeasurementsState:  "loading" | "pending" | "ready" | "not_found" | "error",
 *
 *   studyUID: string | null,
 *   panechoEchoprimeResults: any,
 *   dynamicMeasurementsResults: any,
 *   hasMeasurements: boolean,
 *
 *   isPolling: boolean,
 *   refresh: () => void,
 *   patientName: string | null,
 * }}
 */
export function useStudyResults(studyUid) {
    const [patientName, setPatientName] = useState(null);

    // ---- Queries --------------------------------------------------------------
    const combinedResultsQuery = usePanechoEchoprimeResultsQuery(studyUid, {
        enabled: Boolean(studyUid),
    });

    const dynamicMeasurementsResultsQuery =
        useDynamicMeasurementsResultsQuery(studyUid, {
            enabled: Boolean(studyUid),
        });

    useEffect(() => {
        let cancel = false;
        (async () => {
            if (!studyUid) {
                if (!cancel) setPatientName(null);
                return;
            }
            try {
                const studies = await listStudiesApi();
                if (cancel) return;
                const match = Array.isArray(studies) ? studies.find((s) => s.study_uid === studyUid) : null;
                setPatientName(match?.patient?.patient_name || null);
            } catch {
                if (!cancel) setPatientName(null);
            }
        })();
        return () => { cancel = true; };
    }, [studyUid]);

    // ---- Resource descriptors -------------------------------------------------
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
    ];

    // ---- Aggregate page-level state ------------------------------------------
    const pageState = useMemo(() => {
        if (!studyUid) return "not_found";

        const datas = resources.map((resource) => resource.query.data);
        const fetchings = resources.map((resource) => resource.query.isFetching);
        const errors = resources.map((resource) => resource.query.isError);

        const noDataYet = datas.every((data) => !data);
        if (noDataYet) return "loading";

        const all404 =
            datas.length > 0 && datas.every((data) => data?.status === 404);
        if (all404) return "not_found";

        const anyPending = datas.some(
            (data) =>
                data?.isPending ||
                (data?.status === 202 && data?.data?.status === "pending")
        );
        if (anyPending) return "pending";

        const anyComplete = datas.some(
            (data) =>
                data?.isComplete ||
                (data?.status === 200 && data?.data?.status === "complete")
        );
        if (anyComplete) return "ready";

        const anyFetching = fetchings.some(Boolean);
        if (anyFetching) return "loading";

        const anyError = errors.some(Boolean);
        if (anyError) return "error";

        return "error";
    });

    // ---- Helper for per-query state ------------------------------------------
    const computeState = (query) => {
        const data = query.data;

        if (!studyUid) return "not_found";
        if (!data) return "loading";
        if (data.status === 404) return "not_found";
        if (query.isFetching) return "loading";
        if (
            data.isPending ||
            (data.status === 202 && data.data?.status === "pending")
        ) {
            return "pending";
        }
        if (
            data.isComplete ||
            (data.status === 200 && data.data?.status === "complete")
        ) {
            return "ready";
        }
        if (query.isError) return "error";

        return "error";
    };

    // ---- Individual states ----------------------------------------------------
    const panEchoEchoprimeState = useMemo(
        () => computeState(combinedResultsQuery),
        [combinedResultsQuery.data, combinedResultsQuery.isFetching]
    );

    const dynamicMeasurementsState = useMemo(
        () => computeState(dynamicMeasurementsResultsQuery),
        [
            dynamicMeasurementsResultsQuery.data,
            dynamicMeasurementsResultsQuery.isFetching,
        ]
    );

    // ---- Normalize outputs ----------------------------------------------------
    const panechoEchoprimeResults = useMemo(() => {
        const response = combinedResultsQuery.data;
        if (!response) return null;
        if (response.results) return response.results;
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

    // ---- Derived booleans & controls -----------------------------------------
    const isPolling = useMemo(() => {
        const data = [
            combinedResultsQuery.data,
            dynamicMeasurementsResultsQuery.data,
        ];
        return data.some(
            (d) =>
                d?.isPending ||
                (d?.status === 202 && d?.data?.status === "pending")
        );
    }, [
        combinedResultsQuery.data,
        dynamicMeasurementsResultsQuery.data,
    ]);

    const firstError =
        combinedResultsQuery.error ?? dynamicMeasurementsResultsQuery.error ?? null;

    const hasMeasurements = Boolean(
        panechoEchoprimeResults || dynamicMeasurementsResults
    );

    // ---- Compose output view model -------------------------------------------
    const viewModel = useMemo(
        () => ({
            state: pageState,
            error: firstError,

            panEchoEchoprimeState,
            dynamicMeasurementsState,

            studyUID: studyUid ?? null,
            patientName,

            panechoEchoprimeResults,
            dynamicMeasurementsResults,

            hasMeasurements,
            isPolling,
            patientName,

            refresh: () => {
                combinedResultsQuery.refetch();
                dynamicMeasurementsResultsQuery.refetch();
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
            patientName,
            combinedResultsQuery.refetch,
            dynamicMeasurementsResultsQuery.refetch,
            panEchoEchoprimeState,
            dynamicMeasurementsState,
        ]
    );

    return viewModel;
}
