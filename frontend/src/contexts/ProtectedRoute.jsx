import React, { useContext } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthContext } from "./AuthenticationContext";

/**
 * Guard for authenticated routes.
 *
 * - While `loading` is true, shows a simple loading state (initial /check-auth).
 * - If there is no authenticated `user`, redirects to /login and preserves
 *   the original location in router state so the app can navigate back after login.
 */
export default function ProtectedRoute() {
    const { user, loading } = useContext(AuthContext);
    const location = useLocation();

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!user) {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location }}
            />
        );
    }

    return <Outlet />;
}
