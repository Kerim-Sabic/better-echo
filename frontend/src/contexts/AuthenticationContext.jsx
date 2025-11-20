import { createContext, useState, useEffect, useCallback } from "react";
import { checkAuthApi, loginApi, logoutApi } from "../api/AuthenticationApi";

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

    // Fetch current user from /check-auth (initial auth check)
    const fetchUser = useCallback(async () => {
        try {
            const response = await checkAuthApi();
            setUser(response.user);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    // LOGIN - instantly update context
    const login = async (username, password) => {
        const response = await loginApi(username, password);
        setUser(response.user);
        return response;
    };

    // LOGOUT - instantly clear context
    const logout = async () => {
        await logoutApi();
        setUser(null);
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
