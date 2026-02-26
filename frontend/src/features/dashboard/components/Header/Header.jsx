import React, { useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LogOut } from "lucide-react";
import { Button } from "../../../../general_components/ui/button";
import { AuthContext } from "../../../../contexts/AuthenticationContext";
import {
    getWebauthnStatusApi,
    getWebauthnRegisterOptionsApi,
    completeWebauthnRegisterApi,
    deleteWebauthnCredentialApi,
} from "@/api/webauthn";
import { b64uToBuf, serializePublicKeyCredential } from "../../../../lib/webauthn";
import { getStoredTheme, setStoredTheme } from "../../../../lib/theme";

export default function DashboardHeader({ onNewStudy }) {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const [bioStatus, setBioStatus] = useState({ enrolled: false, credential_ids: [], credential_count: 0 });
    const [bioLoading, setBioLoading] = useState(false);
    const [bioRemoving, setBioRemoving] = useState(false);
    const [bioError, setBioError] = useState("");
    const [theme, setTheme] = useState(() => getStoredTheme());

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        };
        const handleEscape = (event) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    const handleLogout = async () => {
        try {
            await logout();
            navigate("/login", { replace: true });
        } catch (err) {
            console.warn("Logout failed:", err);
        }
    };

    const fetchBioStatus = async () => {
        try {
            const data = await getWebauthnStatusApi();
            setBioStatus({
                enrolled: data?.enrolled || false,
                credential_ids: data?.credential_ids || [],
                credential_count: data?.credential_count || 0,
            });
            setBioError("");
        } catch (err) {
            console.warn("Failed to load biometric status", err);
            setBioError("Unable to load biometric status");
        }
    };

    useEffect(() => {
        if (menuOpen) {
            fetchBioStatus();
        }
    }, [menuOpen]);

    const handleEnroll = async () => {
        if (!window.PublicKeyCredential) {
            setBioError("WebAuthn not supported on this browser");
            return;
        }
        setBioError("");
        setBioLoading(true);
        try {
            const options = await getWebauthnRegisterOptionsApi();
            if (!options?.publicKey) {
                throw new Error("Missing publicKey options from server");
            }
            const publicKey = {
                ...options.publicKey,
                challenge: b64uToBuf(options.publicKey.challenge),
                user: {
                    ...options.publicKey.user,
                    id: b64uToBuf(options.publicKey.user.id),
                },
                excludeCredentials: (options.publicKey.excludeCredentials || []).map((cred) => ({
                    ...cred,
                    id: b64uToBuf(cred.id),
                })),
            };

            const credential = await navigator.credentials.create({ publicKey });
            const serialized = serializePublicKeyCredential(credential);
            await completeWebauthnRegisterApi({
                credential: serialized,
            });
            await fetchBioStatus();
        } catch (err) {
            console.warn("Biometric enroll failed", err);
            const detail = err?.response?.data?.detail;
            const message = err?.message || err?.name;
            setBioError(detail || message || "Biometric enrollment failed");
        } finally {
            setBioLoading(false);
        }
    };

    const handleRemove = async () => {
        const credentialId = bioStatus?.credential_ids?.[0];
        if (!credentialId) {
            setBioError("No credential to remove");
            return;
        }
        setBioError("");
        setBioRemoving(true);
        try {
            await deleteWebauthnCredentialApi(credentialId);
            await fetchBioStatus();
        } catch (err) {
            console.warn("Failed to remove credential", err);
            setBioError("Failed to remove biometric credential");
        } finally {
            setBioRemoving(false);
        }
    };

    const displayName = user?.fullName || user?.full_name || user?.username || "User";
    const roleLabel = user?.role || "Doctor";
    const isDark = theme === "dark";
    const initials = displayName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    const handleThemeToggle = () => {
        const nextTheme = isDark ? "light" : "dark";
        setTheme(nextTheme);
        setStoredTheme(nextTheme);
    };

    return (
        <header className="border-b border-border bg-card">
            <div className="container px-6 py-4 mx-auto">
                <div className="flex items-center justify-between">
                    {/* LEFT SIDE */}
                    <div className="flex items-center space-x-4">
                        <img
                            src="horalix-taskbar-app-icon.png"
                            alt="Horalix Logo"
                            className="w-8 h-8"
                        />
                        <div>
                            <h1 className="text-2xl font-bold heading-accent">
                                Patient Studies
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Manage and review echocardiogram analyses
                            </p>
                        </div>
                    </div>

                    {/* RIGHT SIDE */}
                    <div className="flex items-center gap-3">
                        <Button variant="clinical" onClick={onNewStudy}>
                            <Plus className="w-5 h-5 mr-2" />
                            New Study
                        </Button>

                        {user && (
                            <div className="relative" ref={menuRef}>
                                <button
                                    type="button"
                                    onClick={() => setMenuOpen((open) => !open)}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    className="flex items-center gap-2 rounded-full border border-border bg-white/90 px-3 py-[9px] shadow-sm backdrop-blur transition hover:-translate-y-[1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                >
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full icon-chip-accent text-sm font-semibold">
                                        {initials}
                                    </div>
                                    <div className="text-left">
                                        <div className="text-[13px] font-medium leading-tight text-foreground">
                                            {displayName}
                                        </div>
                                        <span className="mt-0.5 inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                                            {roleLabel}
                                        </span>
                                    </div>
                                </button>

                                {menuOpen && (
                                    <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                                        <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                                            Account
                                        </div>
                                        {!bioStatus?.enrolled && (
                                            <button
                                                type="button"
                                                onClick={handleEnroll}
                                                disabled={bioLoading}
                                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <span>Enroll biometrics</span>
                                            </button>
                                        )}
                                        {bioStatus?.enrolled && (
                                            <button
                                                type="button"
                                                onClick={handleRemove}
                                                disabled={!bioStatus?.credential_ids?.length || bioRemoving}
                                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <span>Remove biometrics</span>
                                            </button>
                                        )}
                                        {bioError && (
                                            <div className="px-3 py-2 text-xs text-destructive">
                                                {bioError}
                                            </div>
                                        )}
                                        <div className="h-px bg-border" />
                                        <div className="flex items-center justify-between px-3 py-2 text-sm text-foreground">
                                            <span>Dark mode</span>
                                            <button
                                                type="button"
                                                onClick={handleThemeToggle}
                                                aria-pressed={isDark}
                                                aria-label="Toggle dark mode"
                                                className={`toggle ${isDark ? "toggle-on" : ""}`}
                                            >
                                                <span className="toggle-thumb" />
                                            </button>
                                        </div>
                                        <div className="h-px bg-border" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                handleLogout();
                                            }}
                                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            Logout
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                {/* Removed accent underline per request */}
            </div>
        </header>
    );
}
