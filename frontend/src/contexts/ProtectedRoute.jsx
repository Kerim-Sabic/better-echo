import React, { useContext } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthContext } from "./AuthenticationContext";
import { useElectronRuntimeConfig } from "@/hooks/useElectronRuntimeConfig";

/**
 * Guard for authenticated routes.
 *
 * - While `loading` is true, shows a simple loading state (initial /check-auth).
 * - If there is no authenticated `user`, redirects to /login and preserves
 *   the original location in router state so the app can navigate back after login.
 */
export default function ProtectedRoute({
    allowedPrincipalTypes = ["user", "vendor"],
    allowedUserRoles = null,
    requireServerRuntime = false,
}) {
    const { user, loading } = useContext(AuthContext);
    const location = useLocation();
    const { runtimeConfig, loading: runtimeLoading } = useElectronRuntimeConfig();
    const principalType = user?.principalType || user?.principal_type || "user";
    const userRole = user?.role || "";

    if (loading || (requireServerRuntime && runtimeLoading)) {
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

    if (requireServerRuntime && runtimeConfig?.runtimeMode !== "server") {
        return <Navigate to="/login" replace />;
    }

    if (!allowedPrincipalTypes.includes(principalType)) {
        const fallbackPath =
            principalType === "vendor"
                ? "/vendor-admin"
                : userRole === "admin"
                    ? "/server-admin"
                    : "/dashboard";
        return <Navigate to={fallbackPath} replace state={{ from: location }} />;
    }

    if (
        principalType === "user" &&
        Array.isArray(allowedUserRoles) &&
        allowedUserRoles.length > 0 &&
        !allowedUserRoles.includes(userRole)
    ) {
        const fallbackPath = userRole === "admin" ? "/server-admin" : "/dashboard";
        return <Navigate to={fallbackPath} replace state={{ from: location }} />;
    }

    return <Outlet />;
}
