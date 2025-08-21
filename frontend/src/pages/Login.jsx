// src/pages/LoginPage.jsx
import React, { useState } from "react";
// Optional icons (run: npm i lucide-react)
import { Eye, EyeOff, Shield, Info } from "lucide-react";

// If the image is in /public, use: const logo = "/horalix_logo.png";
import logo from "../assets/horalix_logo.png"; // or move file to /public and use "/horalix_logo.png"

// If your SplashScreen is at src/components/SplashScreen.jsx:
import SplashScreen from "../components/SplashScreen"; // adjust path if different

const cardStyle = {
    background: "white",
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
    padding: 24,
};
const headerStyle = { textAlign: "center", marginBottom: 16 };
const inputStyle = {
    width: "100%",
    height: 48,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    padding: "0 12px",
    fontSize: 16,
};
const buttonStyle = {
    width: "100%",
    height: 48,
    borderRadius: 10,
    background: "#2563eb",
    color: "white",
    border: "none",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
};
const outlineButtonStyle = {
    ...buttonStyle,
    background: "transparent",
    color: "#111827",
    border: "1px solid #e5e7eb",
};

const LoginPage = ({ onLogin = () => {} }) => {
    // ⬇️ useState must be inside the component
    const [showSplash, setShowSplash] = useState(true);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showAbout, setShowAbout] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        // TODO: replace with real auth
        setTimeout(() => {
            setIsLoading(false);
            onLogin();
        }, 1500);
    };

    // Show splash first
    if (showSplash) {
        return <SplashScreen onComplete={() => setShowSplash(false)} />;
    }

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                background:
                    "linear-gradient(135deg, rgba(240,247,255,1) 0%, rgba(255,255,255,1) 100%)",
            }}
        >
            <div style={{ width: "100%", maxWidth: 420 }}>
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 12,
                            marginBottom: 8,
                        }}
                    >
                        <img
                            src={logo}
                            alt="Horalix Logo"
                            style={{ height: 48, width: 48 }}
                            onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                        <div>
                            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#1d4ed8" }}>
                                Horalix Echo
                            </h1>
                            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                                AI-Powered Cardiac Insights
                            </p>
                        </div>
                    </div>
                </div>

                {/* Login Card */}
                <div style={cardStyle}>
                    <div style={headerStyle}>
                        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Welcome Back</h2>
                        <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
                            Sign in to access your cardiac analysis platform
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
                        <div>
                            <label htmlFor="email" style={{ display: "block", marginBottom: 6, fontSize: 14 }}>
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                placeholder="cardiologist@hospital.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                style={inputStyle}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" style={{ display: "block", marginBottom: 6, fontSize: 14 }}>
                                Password
                            </label>
                            <div style={{ position: "relative" }}>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    style={{ ...inputStyle, paddingRight: 44 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    style={{
                                        position: "absolute",
                                        right: 10,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "transparent",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "#6b7280",
                                    }}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <button type="submit" style={buttonStyle} disabled={isLoading}>
                            {isLoading ? "Signing In..." : "Sign In"}
                        </button>

                        <div style={{ textAlign: "center" }}>
                            <a href="#" style={{ fontSize: 14, color: "#2563eb", textDecoration: "none" }}>
                                Forgot your password?
                            </a>
                        </div>
                    </form>

                    {/* SSO Option */}
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
                        <button style={outlineButtonStyle} type="button">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <Shield size={20} /> Sign in with Hospital SSO
              </span>
                        </button>
                    </div>
                </div>

                {/* About Modal Trigger */}
                <div style={{ textAlign: "center", marginTop: 16 }}>
                    <button
                        onClick={() => setShowAbout(true)}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "#6b7280",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <Info size={16} />
                        About Horalix Echo
                    </button>
                </div>

                {/* Simple modal */}
                {showAbout && (
                    <div
                        onClick={() => setShowAbout(false)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(0,0,0,0.35)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 16,
                            zIndex: 50,
                        }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: "white",
                                borderRadius: 12,
                                maxWidth: 520,
                                width: "100%",
                                padding: 20,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>About Horalix Echo</h3>
                                <button
                                    onClick={() => setShowAbout(false)}
                                    style={{
                                        marginLeft: "auto",
                                        background: "transparent",
                                        border: "none",
                                        fontSize: 20,
                                        lineHeight: 1,
                                        cursor: "pointer",
                                    }}
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            </div>
                            <div style={{ color: "#374151", fontSize: 14, lineHeight: 1.6 }}>
                                <p>
                                    Horalix Echo is a hospital-grade AI echocardiography platform that provides
                                    real-time analysis for cardiologists and sonographers.
                                </p>
                                <p><strong>Key Features:</strong></p>
                                <ul style={{ paddingLeft: 18 }}>
                                    <li>Real-time AI segmentation and measurements</li>
                                    <li>Automated ejection fraction calculation</li>
                                    <li>Valve assessment and severity grading</li>
                                    <li>Clinical-grade reporting</li>
                                    <li>DICOM integration</li>
                                </ul>
                                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                                    Powered by PanEcho &amp; EchoPrime AI
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoginPage;
