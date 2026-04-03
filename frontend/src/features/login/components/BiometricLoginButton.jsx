import { Fingerprint } from "lucide-react";

export default function BiometricLoginButton({ isLoading, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-primary smooth-transition disabled:cursor-not-allowed disabled:opacity-60"
      aria-label="Biometric login"
    >
      <Fingerprint className="w-5 h-5 group-hover-animate-glow group-hover:drop-shadow-[0_0_12px_rgba(85,137,247,0.55)]" />
      <span className="text-xs">{isLoading ? "Connecting..." : "Biometric"}</span>
    </button>
  );
}
