import { createContext, useState, useEffect, useCallback } from "react";
import { checkAuthApi, loginApi, logoutApi } from "@/api/authentication";
import { clearDesktopAuthToken } from "@/api/desktopAuth";
import { getBackendUrl } from "../config/api";

export const AuthContext = createContext();

const SESSION_HINT_KEY = "authSessionHint";

/**
 * Provides the authenticated user and auth helpers.
 *
 * Notes:
 * - `loading` represents the initial `/check-auth` request on app startup.
 * - Consumers should respect `loading` to avoid flicker or premature redirects
 *   while the auth state is still being resolved.
 */
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const waitForHealth = useCallback(async () => {
        try {
            const base = await getBackendUrl();
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 1200);
            const res = await fetch(`${base}/health`, { signal: controller.signal });
            clearTimeout(id);
            return res.ok;
        } catch {
            return false;
        }
    }, []);

    const hasSessionHint = useCallback(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem(SESSION_HINT_KEY) === "1";
    }, []);

    // Fetch current user from /check-auth (initial auth check)
    const fetchUser = useCallback(async () => {
        try {
            const healthy = await waitForHealth();
            if (healthy && hasSessionHint()) {
                const response = await checkAuthApi();
                setUser(response.user);
            } else {
                setUser(null);
            }
        } catch (error) {
            if (error?.response?.status === 401) {
                try { localStorage.removeItem(SESSION_HINT_KEY); } catch {}
                clearDesktopAuthToken();
            }
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, [hasSessionHint, waitForHealth]);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    // LOGIN - instantly update context
    const login = async (username, password) => {
        const response = await loginApi(username, password);
        setUser(response.user);
        try { localStorage.setItem(SESSION_HINT_KEY, "1"); } catch {}
        return response;
    };

    // LOGOUT - instantly clear context
    const logout = async () => {
        await logoutApi();
        setUser(null);
        try { localStorage.removeItem(SESSION_HINT_KEY); } catch {}
    };

    const value = {
        user,
        setUser,
        refreshUser: fetchUser,
        login,
        logout,
        loading,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
