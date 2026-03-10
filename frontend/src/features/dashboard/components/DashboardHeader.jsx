import React, { useEffect, useRef } from "react";
import { Plus, LogOut } from "lucide-react";
import { Button } from "@/general_components/ui/button";

export default function DashboardHeader({ dashboardHeaderViewModel, onNewStudy }) {
  const menuContainerRef = useRef(null);

  const {
    hasAuthenticatedUser,
    userDisplayName,
    userRoleLabel,
    userInitials,
    isUserMenuOpen,
    onToggleUserMenu,
    closeUserMenu,
    isBiometricEnrolled,
    biometricCredentialCount,
    isBiometricStatusLoading,
    isBiometricRemoving,
    biometricErrorMessage,
    onEnrollBiometrics,
    onRemoveBiometrics,
    isDarkTheme,
    onToggleTheme,
    onLogout,
  } = dashboardHeaderViewModel;

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handleMouseDown = event => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target)) {
        closeUserMenu();
      }
    };

    const handleEscape = event => {
      if (event.key === "Escape") {
        closeUserMenu();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isUserMenuOpen, closeUserMenu]);

  return (
    <header className="border-b border-border bg-card">
      <div className="container px-6 py-4 mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img src="horalix-taskbar-app-icon.png" alt="Horalix Logo" className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold heading-accent">Patient Studies</h1>
              <p className="text-sm text-muted-foreground">
                Manage and review echocardiogram analyses
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="clinical" onClick={onNewStudy}>
              <Plus className="w-5 h-5 mr-2" />
              New Study
            </Button>

            {hasAuthenticatedUser && (
              <div className="relative" ref={menuContainerRef}>
                <button
                  type="button"
                  onClick={onToggleUserMenu}
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                  className="flex items-center gap-2 rounded-full border border-border bg-white/90 px-3 py-[9px] shadow-sm backdrop-blur transition hover:-translate-y-[1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full icon-chip-accent text-sm font-semibold">
                    {userInitials}
                  </div>
                  <div className="text-left">
                    <div className="text-[13px] font-medium leading-tight text-foreground">
                      {userDisplayName}
                    </div>
                    <span className="mt-0.5 inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                      {userRoleLabel}
                    </span>
                  </div>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                    <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                      Account
                    </div>

                    {!isBiometricEnrolled && (
                      <button
                        type="button"
                        onClick={onEnrollBiometrics}
                        disabled={isBiometricStatusLoading}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span>{isBiometricStatusLoading ? "Enrolling..." : "Enroll biometrics"}</span>
                      </button>
                    )}

                    {isBiometricEnrolled && (
                      <button
                        type="button"
                        onClick={onRemoveBiometrics}
                        disabled={isBiometricRemoving}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span>{isBiometricRemoving ? "Removing..." : "Remove biometrics"}</span>
                        <span className="text-xs text-muted-foreground">{biometricCredentialCount}</span>
                      </button>
                    )}

                    {biometricErrorMessage && (
                      <div className="px-3 py-2 text-xs text-destructive">{biometricErrorMessage}</div>
                    )}

                    <div className="h-px bg-border" />

                    <div className="flex items-center justify-between px-3 py-2 text-sm text-foreground">
                      <span>Dark mode</span>
                      <button
                        type="button"
                        onClick={onToggleTheme}
                        aria-pressed={isDarkTheme}
                        aria-label="Toggle dark mode"
                        className={`toggle ${isDarkTheme ? "toggle-on" : ""}`}
                      >
                        <span className="toggle-thumb" />
                      </button>
                    </div>

                    <div className="h-px bg-border" />

                    <button
                      type="button"
                      onClick={onLogout}
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
      </div>
    </header>
  );
}
