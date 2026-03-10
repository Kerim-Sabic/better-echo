// src/App.js
import React from "react";
import TitleBar, { TITLEBAR_HEIGHT } from "./general_components/TitleBar";
import { BrowserRouter, Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
import RoutePersistence from "./RoutePersistence";

import { AuthProvider } from "./contexts/AuthenticationContext";
import ProtectedRoute from "./contexts/ProtectedRoute";

import SplashScreen from "./general_components/SplashScreen";
import LoginPage from "@/features/login/views/LoginPage";
import DashboardPage from "@/features/dashboard/views/DashboardPage";
import NewStudyPage from "@/features/new_study/views/NewStudyPage";
import StudyResultsPage from "@/features/study_results/views/StudyResultsPage";


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
    const onSplash = location.pathname === "/";
    const contentStyle = {
        height: `calc(100vh - ${TITLEBAR_HEIGHT}px)`,
        marginTop: `${TITLEBAR_HEIGHT}px`,
        overflow: "auto",
    };
    return (
        <div style={{ height: "100vh", overflow: "hidden"}}>
        <TitleBar variant={onSplash ? "splash" : "light"} />
        <div style={contentStyle}>
            <AuthProvider> {/* Authentication context */}
            <RoutePersistence />
            <Routes>
            {/* Splash → auto-navigates to /login */}
            <Route path="/" element={<SplashRoute />} />

            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />

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
        <BrowserRouter>
        <Shell />
        </BrowserRouter>
    );
}
