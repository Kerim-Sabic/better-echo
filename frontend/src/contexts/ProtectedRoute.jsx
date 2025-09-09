import React, { useContext } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AuthContext } from "./AuthenticationContext";

export default function ProtectedRoute() {
    const { user, loading } = useContext(AuthContext);

    if (loading) {
        return <div>Loading...</div>;
    }
    
    if (!user) {
        return <Navigate to ="/login" replace />
    }

    return <Outlet />;
}