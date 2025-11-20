import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const LAST_ROUTE_KEY = "lastRoute";

/**
 * Persists the last visited route in localStorage.
 *
 * Intended to be mounted once near the root so that the Electron shell or
 * startup logic can restore the most recent route on next launch.
 */
export default function RoutePersistence() {
    const location = useLocation();

    useEffect(() => {
        try {
            const value =
                location.pathname +
                (location.search || "") +
                (location.hash || "");
            localStorage.setItem(LAST_ROUTE_KEY, value);
        } catch {
            // ignore storage errors (private mode, disabled storage, etc.)
        }
    }, [location]);

    return null;
}

