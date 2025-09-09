import { createContext, useState, useEffect, useCallback } from "react";
import { checkAuthApi, loginApi, logoutApi } from "../api/AuthenticationApi"; // Imported API function

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true); // to track initial fetch

    // Fetch current user from /check-auth
    const fetchUser = useCallback(async () => {
        try {
            const response = await checkAuthApi();
            setUser(response.user);
        }   catch (err) {
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
        const response = await loginApi(username, password); // calls the backend
        setUser(response.user); // Directly set the logged-in user
        return response; // Return response if needed for navigation
    }

    // LOGOUT - instantly clear context
    const logout = async() => {
        await logoutApi();
        setUser(null); // Clear user immediately
    }

    const value = { 
        user, 
        setUser, 
        refreshUser: fetchUser,
        login,
        logout, 
        loading };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};