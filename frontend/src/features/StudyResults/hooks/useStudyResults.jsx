import { useEffect, useState, useRef } from "react";
import { listStudiesApi, listDerivedResultsApi } from "../../../api/StudiesApi";
import { inferPanEchoApi } from "../../../api/InferenceApi";

// -- Hook for fetching study metadata by id logic and --
// -- calling the inference and loading the results for the PanEcho model --
// -- The inference and loading the results for the EchoPrime model are --
// -- still in the Report.jsx file --

export function useStudyResults(id) {
    const [study, setStudy] = useState(null);
    const [derivedResults, setDerivedResults] = useState(null);
    const [loading, setLoading] = useState(true);
    const [polling, setPolling] = useState(false);

    const startedRef = useRef(false);

    const studyUID = study?.study_uid || null;

    // Fetch study metadata by id
    const fetchStudy = async () => {
        const list = await listStudiesApi();

        let found =
            list.find((s) => s.study_uid === id) ||
            list.find((s) => String(s.id) === String(id));
        
        if (!found && list.length === 1) found = list[0];

        setStudy(found || null);
        setLoading(false);

        return found;
    };

    // Fetch derived inference results for the Panecho tasks
    const fetchDerivedResults = async () => {
        if (!studyUID) return;

        let timer;
        try {
            const results = await listDerivedResultsApi(studyUID);
            const row = results.find(r => r.type === "PanEcho_AllTasks");

            if (row && row.value_json) {
                // 1. If results already exist, save them and stop loading
                const json = JSON.parse(row.value_json);
                setDerivedResults(json);
                setLoading(false);
                return;
            }

            // 2. If no results and inference has not been started yet
            if (!startedRef.current) {
                startedRef.current = true;
                try {
                    await inferPanEchoApi({ study_uid: studyUID });
                } catch (err) {
                    console.error("[Report] PanEcho_AllTasks inference failed: ", err);
                }
            }

            // 3. Start polling for results every 3 seconds
            setPolling(true);
            timer = setInterval(async () => {
                const updated = await listDerivedResultsApi(studyUID);
                const updated_row = updated.find(r => r.type === "PanEcho_AllTasks");
                if (updated_row && updated_row.value_json) {
                    // Stop polling once results are available
                    clearInterval(timer);
                    const updated_json = JSON.parse(updated_row.value_json)
                    setDerivedResults(updated_json);
                    setPolling(false);
                    setLoading(false);
                }
            }, 3000);
        } catch (err) {
            console.error("[useStudyResults] Failed:", err);
            setLoading(false);
        }

        // Cleanup: if component unmounts -> clear polling interval
        return () => {
            if (timer) clearInterval(timer);
        };
    };

    useEffect(() => {
        (async () => {
            await fetchStudy();
        })();
    }, [id]);

    useEffect(() => {
        if (studyUID) {
            fetchDerivedResults();
        }
    }, [studyUID]);

    return {
        study, // Study metadata
        studyUID, // Unique study identifier
        derivedResults, // Inference results for the PanEcho model
        loading, // Loading state
        polling, // Polling state
        refresh: async () => { // Manual refresh function
            setLoading(true);
            await fetchStudy();
            await fetchDerivedResults();
        },
    };
}