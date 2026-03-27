// src/App.js
import React, { useEffect } from "react";
import TitleBar, { TITLEBAR_HEIGHT } from "./general_components/TitleBar";
import { BrowserRouter, HashRouter, Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
import RoutePersistence from "./RoutePersistence";

import { AuthProvider } from "./contexts/AuthenticationContext";
import ProtectedRoute from "./contexts/ProtectedRoute";

import SplashScreen from "./general_components/SplashScreen";
import RuntimeConfigGate from "./general_components/RuntimeConfigGate";
import LoginPage from "@/features/login/views/LoginPage";
import DashboardPage from "@/features/dashboard/views/DashboardPage";
import NewStudyPage from "@/features/new_study/views/NewStudyPage";
import StudyResultsPage from "@/features/study_results/views/StudyResultsPage";
import ServerAdminPage from "@/features/server_admin/views/ServerAdminPage";
import { useElectronRuntimeConfig } from "@/hooks/useElectronRuntimeConfig";
import { getRuntimeDisplayName } from "@/lib/branding";

const AppRouter =
    typeof window !== "undefined" && window.electronAPI && window.location.protocol === "file:"
        ? HashRouter
        : BrowserRouter;

function SplashRoute() {
    const navigate = useNavigate();
    return (
        <SplashScreen
        onComplete={() => {
            try {
            const saved = localStorage.getItem("lastRoute");
            if (saved && saved !== "/" && saved !== "/login") {
                navigate(saved);
                return;
            }
            } catch (e) {
            // ignore storage errors
            }
            navigate("/login");
        }}
        />
    );
}

function Shell() {
    const location = useLocation();
    const { runtimeConfig } = useElectronRuntimeConfig();
    const onSplash = location.pathname === "/";
    const onStudyResults =
        /^\/studies\/[^/]+$/.test(location.pathname) && location.pathname !== "/studies/new";
    const contentStyle = {
        height: `calc(100vh - ${TITLEBAR_HEIGHT}px)`,
        marginTop: `${TITLEBAR_HEIGHT}px`,
        overflow: "auto",
    };

    useEffect(() => {
        document.title = getRuntimeDisplayName(runtimeConfig?.runtimeMode);
    }, [runtimeConfig?.runtimeMode]);

    return (
        <div style={{ height: "100vh", overflow: "hidden"}}>
        <TitleBar variant={onSplash ? "splash" : onStudyResults ? "dark" : "light"} />
        <div style={contentStyle}>
            <AuthProvider> {/* Authentication context */}
            <RoutePersistence />
            <Routes>
            {/* Splash → auto-navigates to /login */}
            <Route path="/" element={<SplashRoute />} />

            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/server-admin" element={<ServerAdminPage />} />

            {/* App */}{/*Protected routes */}
            <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/studies/new" element={<NewStudyPage />} />
                <Route path="/studies/:studyUid" element={<StudyResultsPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </AuthProvider>
        </div>
        </div>
    );
}

export default function App() {
    return (
        <AppRouter>
        <RuntimeConfigGate>
        <Shell />
        </RuntimeConfigGate>
        </AppRouter>
    );
}
