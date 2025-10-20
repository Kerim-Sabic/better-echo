// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from "react-router-dom";

import { AuthProvider } from "./contexts/AuthenticationContext";
import ProtectedRoute from "./contexts/ProtectedRoute";

import SplashScreen from "./components/SplashScreen";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewStudy from "./pages/NewStudy";
import StudyResults from "./pages/StudyResults";


function SplashRoute() {
  const navigate = useNavigate();
  return <SplashScreen onComplete={() => navigate("/login")} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider> {/* Authentication context */}
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
    </BrowserRouter>
  );
}
