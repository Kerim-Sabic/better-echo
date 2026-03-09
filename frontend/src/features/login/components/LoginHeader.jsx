export default function LoginHeader() {
  return (
    <div className="text-center mb-10 animate-slide-up">
      <img
        src="horalix-taskbar-app-icon.png"
        alt="Horalix Logo"
        className="h-20 w-auto mx-auto drop-shadow-lg mb-3"
      />
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Horalix Pulse</h1>
      <p className="text-muted-foreground font-light text-sm tracking-wide">
        AI-Powered Cardiac Precision
      </p>
    </div>
  );
}
