import { createContext, useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { checkAuthApi, loginApi, logoutApi } from "@/api/authentication";
import {
    clearStoredAuthSession,
    markAuthSessionActive,
    persistSessionHint,
    SESSION_HINT_KEY,
    subscribeAuthSessionExpired,
} from "@/api/authSession";
import { formatAuthResponse } from "@/features/login/model/login.dto";
import { getBackendUrl } from "../config/api";

export const AuthContext = createContext();

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
    const [sessionExpiredNoticeVisible, setSessionExpiredNoticeVisible] = useState(false);
    const queryClient = useQueryClient();

    const clearSessionExpiredNotice = useCallback(() => {
        setSessionExpiredNoticeVisible(false);
    }, []);

    const clearAuthenticatedState = useCallback(({ showSessionExpiredNotice = false } = {}) => {
        setUser(null);
        setLoading(false);
        setSessionExpiredNoticeVisible(showSessionExpiredNotice);
        clearStoredAuthSession();
        queryClient.clear();
    }, [queryClient]);

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
                setUser(formatAuthResponse(response).user);
                markAuthSessionActive();
            } else {
                setUser(null);
            }
        } catch (error) {
            if (error?.response?.status === 401) {
                clearStoredAuthSession();
            }
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, [hasSessionHint, waitForHealth]);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    useEffect(() => {
        return subscribeAuthSessionExpired(() => {
            clearAuthenticatedState({ showSessionExpiredNotice: true });
        });
    }, [clearAuthenticatedState]);

    // LOGIN - instantly update context
    const login = async (username, password) => {
        const response = await loginApi(username, password);
        setUser(formatAuthResponse(response).user);
        persistSessionHint();
        clearSessionExpiredNotice();
        return response;
    };

    // LOGOUT - instantly clear context
    const logout = async () => {
        try {
            await logoutApi();
        } finally {
            clearAuthenticatedState();
        }
    };

    const value = {
        user,
        setUser,
        refreshUser: fetchUser,
        login,
        logout,
        loading,
        sessionExpiredNoticeVisible,
        clearSessionExpiredNotice,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
