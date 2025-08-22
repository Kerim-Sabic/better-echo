import { useEffect, useState } from "react";
// If you have this asset, place it in src/assets and use a relative import.
// Otherwise you can remove the backgroundImage style below.
import heroBackground from "../assets/hero-background.jpg";

export default function SplashScreen({ onComplete }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onComplete?.(), 500); // wait for fade
    }, 3000);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 bg-gradient-clinical flex items-center justify-center z-50 transition-opacity duration-500 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        backgroundImage: heroBackground
          ? `linear-gradient(rgba(255,255,255,.9), rgba(255,255,255,.9)), url(${heroBackground})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      role="img"
      aria-label="Application loading screen"
    >
      <div className="text-center">
        <div className="mb-8 flex items-center justify-center">
          <div className="relative">
            {/* Update src to your logo path */}
            <img
              src="/lovable-uploads/9d9bcdf0-8a16-4777-8dc3-85ea7af6f600.png"
              alt="App Logo"
              className="h-20 w-20 heartbeat"
              role="img"
              aria-label="Company logo"
            />
            <div className="absolute inset-0 h-20 w-20 rounded-full bg-primary/20 animate-pulse" />
          </div>
          <div className="ml-4">
            <h1 className="text-4xl font-bold text-primary">Horalix</h1>
            <h2 className="text-2xl font-light text-primary/80">Echo</h2>
          </div>
        </div>

        <p className="text-xl text-muted-foreground font-medium">
          AI-Powered Cardiac Insights
        </p>

        <div
          className="mt-8 flex justify-center"
          role="progressbar"
          aria-label="Application loading"
        >
          <div className="w-32 h-1 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-gradient-primary animate-pulse rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
