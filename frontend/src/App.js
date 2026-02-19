// src/App.js
import React from "react";
import TitleBar, { TITLEBAR_HEIGHT } from "./components/TitleBar";
import { BrowserRouter, Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
import RoutePersistence from "./RoutePersistence";

import { AuthProvider } from "./contexts/AuthenticationContext";
import ProtectedRoute from "./contexts/ProtectedRoute";

import SplashScreen from "./components/SplashScreen";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewStudy from "./pages/NewStudy";
import StudyResults from "./pages/StudyResults";


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
            <Route path="/login" element={<Login />} />

            {/* App */}{/*Protected routes */}
            <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/studies/new" element={<NewStudy />} />
                <Route path="/studies/:studyUid" element={<StudyResults />} />
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
