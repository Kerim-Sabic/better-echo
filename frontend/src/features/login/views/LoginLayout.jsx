import { useEffect } from "react";
import { TITLEBAR_HEIGHT } from "@/general_components/TitleBar";
import {
  AboutHoralixDialog,
  BiometricLoginButton,
  LoginForm,
  LoginHeader,
} from "@/features/login/components";

export default function LoginLayout({ loginPageVM }) {
  const {
    username,
    password,
    error,
    isLoading,
    bioLoading,
    setUsername,
    setPassword,
    handleSubmit,
    handleBiometricLogin,
    canOpenServerAdmin,
    onOpenServerAdmin,
    canReconfigureClientRuntime,
    onOpenClientRuntimeConfigEditor,
  } = loginPageVM;

  useEffect(() => {
    if (!canReconfigureClientRuntime) {
      return undefined;
    }

    const handleKeyDown = event => {
      if (event.key === "F8") {
        event.preventDefault();
        onOpenClientRuntimeConfigEditor();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canReconfigureClientRuntime, onOpenClientRuntimeConfigEditor]);

  return (
    <div
      className="theme-login relative flex items-center justify-center px-4 bg-[#f8f8f8]"
      style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(85,137,247,0.07),transparent_55%)] pointer-events-none" />

      <div className="relative w-full max-w-md px-2 animate-fade-in">
        <LoginHeader />

        <div className="glass-card rounded-2xl p-8 animate-slide-up" style={{ animationDelay: "0.05s" }}>
          <LoginForm
            username={username}
            password={password}
            error={error}
            isSubmitting={isLoading}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={handleSubmit}
          />

          <div className="mt-6 pt-6 border-t border-border/50 flex items-center justify-center">
            <BiometricLoginButton isLoading={bioLoading} onClick={handleBiometricLogin} />
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-4 text-center">
          <AboutHoralixDialog />
          {canOpenServerAdmin ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onOpenServerAdmin}
                className="text-sm font-medium text-muted-foreground transition hover:text-primary"
              >
                Open Server Setup
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
