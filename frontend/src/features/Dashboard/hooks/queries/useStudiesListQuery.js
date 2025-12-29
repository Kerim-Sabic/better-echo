import { useState, useEffect, useCallback } from "react";
import { listStudiesApi } from "../../../../api/StudiesApi";

/**
 * Hook to manage fetching and polling of the studies list.
 * Returns { studies, loading, refresh, setStudies }
 */
export function useStudiesListQuery() {
    const [studies, setStudies] = useState([]);
    const [loading, setLoading] = useState(true);

    // Core fetch function
    const fetchStudies = useCallback(async () => {
        try {
            const data = await listStudiesApi();
            setStudies(data);
            return data;
        } catch (err) {
            console.warn("Failed to fetch studies", err);
            return [];
        }
    }, []);

    // Initial Load
    useEffect(() => {
        let cancel = false;
        (async () => {
            try {
                const data = await listStudiesApi();
                if (!cancel) {
                    setStudies(data);
                    setLoading(false);
                }
            } catch (err) {
                if (!cancel) setLoading(false);
            }
        })();
        return () => { cancel = true; };
    }, []);

    // Polling (every 10s)
    useEffect(() => {
        const t = setInterval(() => {
            fetchStudies();
        }, 10000);
        return () => clearInterval(t);
    }, [fetchStudies]);

    return {
        studies,
        loading,
        refresh: fetchStudies, // Exposed for manual re-fetch (e.g. after Edit)
        setStudies,            // Exposed for optimistic updates (e.g. after Delete)
    };
}