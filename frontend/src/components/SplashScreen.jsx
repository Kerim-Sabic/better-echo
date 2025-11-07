import { useEffect, useRef, useState } from "react";
import { getBackendUrl } from "../config/api";

export default function SplashScreen({ onComplete }) {
  const videoRef = useRef(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isZooming, setIsZooming] = useState(false);
  const [direction, setDirection] = useState("forward"); // "forward" | "backward"
  const [audioAllowed, setAudioAllowed] = useState(false);

  // Helper: check backend health
  async function checkHealth() {
    try {
      const base = await getBackendUrl(); // e.g., http://127.0.0.1:8000/api
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${base}/health`, { signal: controller.signal });
      clearTimeout(id);
      return res.ok;
    } catch {
      return false;
    }
  }

  // Play helpers
  const playForward = (muted) => {
    const el = videoRef.current;
    if (!el) return;
    el.src = "/horalix-splash-video.mp4";
    el.muted = !!muted;
    el.currentTime = 0;
    el.play().catch(() => {});
    setDirection("forward");
  };
  const playBackward = (muted) => {
    const el = videoRef.current;
    if (!el) return;
    el.src = "/horalix-splash-video-reversed.mp4";
    el.muted = !!muted;
    el.currentTime = 0;
    el.play().catch(() => {});
    setDirection("backward");
  };

  // On mount: decide audio for first pass and start forward
  useEffect(() => {
    const playedBefore = typeof window !== "undefined" && localStorage.getItem("splashAudioPlayed") === "true";
    const allowAudio = !playedBefore;
    setAudioAllowed(allowAudio);
    // Start forward; audio only if not played before
    playForward(!allowAudio ? true : false);
  }, []);

  // Handle video end -> check readiness -> loop forward/back silently until ready
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onEnded = async () => {
      // If first forward pass just ended and audio was allowed, mark as played
      if (direction === "forward" && audioAllowed) {
        try { localStorage.setItem("splashAudioPlayed", "true"); } catch {}
        setAudioAllowed(false);
      }

      const ready = await checkHealth();
      if (ready) {
        // Smooth crossfade + slight zoom
        setIsZooming(true);
        setTimeout(() => setIsVisible(false), 50);
        setTimeout(() => onComplete?.(), 700);
        return;
      }

      // Not ready yet: pause ~300ms, then alternate direction silently
      setTimeout(() => {
        if (direction === "forward") {
          playBackward(true);
        } else {
          playForward(true);
        }
      }, 300);
    };

    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [direction, audioAllowed, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-700 ease-out pointer-events-none ${
        isVisible ? "opacity-100" : "opacity-0"
      } ${isZooming ? "scale-105" : "scale-100"}`}
      style={{ backgroundColor: "#000" }}
      aria-label="Application loading screen"
    >
      <video
        ref={videoRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vh] object-contain"
        playsInline
        preload="auto"
      />
    </div>
  );
}
