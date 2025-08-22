// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";

import SplashScreen from "./components/SplashScreen";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewStudy from "./pages/NewStudy";

// Temporary placeholders — replace with your real pages when ready
// const NewStudy = () => (
//   <div className="p-8">New Study (upload workflow here)</div>
// );
const StudyResults = () => <div className="p-8">Study Results page</div>;
const NotFound = () => <div className="p-8">404 — Not Found</div>;

function SplashRoute() {
  const navigate = useNavigate();
  return <SplashScreen onComplete={() => navigate("/login")} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Splash → auto-navigates to /login */}
        <Route path="/" element={<SplashRoute />} />

        {/* Auth */}
        <Route path="/login" element={<Login />} />

        {/* App */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/studies/new" element={<NewStudy />} />
        <Route path="/studies/:id" element={<StudyResults />} />

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
