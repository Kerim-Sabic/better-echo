// src/App.js
import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "./pages/Login";
import Home from "./pages/Home";
import Forms from "./pages/Forms";
import Results from "./pages/Result";

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    return (
        <Router>
            <Routes>
                {/* Default route */}
                <Route
                    path="/"
                    element={
                        isLoggedIn ? (
                            <Navigate to="/home" replace />
                        ) : (
                            <LoginPage onLogin={() => setIsLoggedIn(true)} />
                        )
                    }
                />

                {/* Home (protected) */}
                <Route
                    path="/home"
                    element={isLoggedIn ? <Home /> : <Navigate to="/" replace />}
                />

                {/* Forms (protected) */}
                <Route
                    path="/forms"
                    element={isLoggedIn ? <Forms /> : <Navigate to="/" replace />}
                />

                {/* Results (protected) */}
                <Route
                    path="/results"
                    element={isLoggedIn ? <Results /> : <Navigate to="/" replace />}
                />
            </Routes>
        </Router>
    );
}

export default App;
