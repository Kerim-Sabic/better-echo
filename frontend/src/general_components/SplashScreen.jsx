import { useCallback, useEffect, useRef, useState } from "react";
import { getBackendUrl } from "../config/api";

const SPLASH_READY_EXIT_DELAY_MS = 800;
const SPLASH_MAX_WAIT_MS = 15000;

function getSplashAssetUrl(fileName) {
    const publicBase = String(process.env.PUBLIC_URL || "").replace(/\/+$/, "");

    if (publicBase === ".") {
        return `./${fileName}`;
    }

    if (publicBase) {
        return `${publicBase}/${fileName}`;
    }

    if (typeof window !== "undefined" && window.location.protocol === "file:") {
        return `./${fileName}`;
    }

    return `/${fileName}`;
}

export default function SplashScreen({ onComplete }) {
    const videoARef = useRef(null); // forward
    const videoBRef = useRef(null); // reverse
    const backendReadyRef = useRef(false);
    const hasCompletedRef = useRef(false);
    const completeTimerRef = useRef(null);
    const [isVisible, setIsVisible] = useState(true);
    const [isZooming, setIsZooming] = useState(false);
    const [active, setActive] = useState("A"); // "A" | "B"
    const [audioAllowed, setAudioAllowed] = useState(false);

  const checkHealth = useCallback(async () => {
        try {
            const ipcHealth = window?.electronAPI?.checkBackendHealth;
            if (ipcHealth) {
                return await ipcHealth();
            }
            const base = await getBackendUrl(); // e.g., http://127.0.0.1:8000/api
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 1200);
            const res = await fetch(`${base}/health`, { signal: controller.signal });
            clearTimeout(id);
            return res.ok;
        } catch {
            return false;
        }
    }, []);

    const completeSplash = useCallback(() => {
        if (hasCompletedRef.current) return;
        hasCompletedRef.current = true;
        setIsZooming(true);
        setIsVisible(false);
        setTimeout(() => onComplete?.(), 50);
    }, [onComplete]);

    const playVideo = useCallback((el, muted) => {
        if (!el) return;
        el.muted = !!muted;
        try {
            el.currentTime = 0;
        } catch {}
        el.play().catch(() => {});
    }, []);

    const scheduleSplashCompletion = useCallback((delayMs = 50) => {
        if (hasCompletedRef.current || completeTimerRef.current) {
            return;
        }

        completeTimerRef.current = setTimeout(() => {
            completeTimerRef.current = null;
            completeSplash();
        }, delayMs);
    }, [completeSplash]);

    // Background health checks (IPC) to allow exit while app is unfocused
    useEffect(() => {
        let isActive = true;

        const pollHealth = async () => {
            if (backendReadyRef.current) return;
            const ready = await checkHealth();
            if (!isActive || !ready) return;
            backendReadyRef.current = true;
            scheduleSplashCompletion(SPLASH_READY_EXIT_DELAY_MS);
        };

        pollHealth();
        const id = setInterval(pollHealth, 2000);
        return () => {
            isActive = false;
            clearInterval(id);
            if (completeTimerRef.current) {
                clearTimeout(completeTimerRef.current);
                completeTimerRef.current = null;
            }
        };
    }, [checkHealth, scheduleSplashCompletion]);

    // Safety net: never allow the splash to block the app indefinitely.
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            scheduleSplashCompletion();
        }, SPLASH_MAX_WAIT_MS);

        return () => clearTimeout(timeoutId);
    }, [scheduleSplashCompletion]);

    // Initialize both videos and start forward pass
    useEffect(() => {
        const playedBefore = typeof window !== "undefined" && localStorage.getItem("splashAudioPlayed") === "true";
        const allowAudio = !playedBefore;
        setAudioAllowed(allowAudio);

        const a = videoARef.current;
        const b = videoBRef.current;
        if (!a || !b) return;

        // Set sources and preload
        a.src = getSplashAssetUrl("horalix-splash-video.mp4");
        b.src = getSplashAssetUrl("horalix-splash-video-reversed.mp4");
        try { a.load(); } catch {}
        try { b.load(); } catch {}

        // Start forward (A). Allow audio only on first ever run
        playVideo(a, !allowAudio);
        // Keep reverse (B) preloaded + muted
        b.muted = true;
        setActive("A");
    }, [audioAllowed, playVideo]);

  // Handle ends for both players -> crossfade, poll health, exit when ready
    useEffect(() => {
        const a = videoARef.current;
        const b = videoBRef.current;
        if (!a || !b) return;

        const onEndedA = async () => {
            // First forward completion: persist audio flag
            if (audioAllowed) {
                try { localStorage.setItem("splashAudioPlayed", "true"); } catch {}
                setAudioAllowed(false);
            }
            if (backendReadyRef.current) {
                scheduleSplashCompletion();
                return;
            }
            const ready = await checkHealth();
            if (ready) {
                backendReadyRef.current = true;
                scheduleSplashCompletion();
                return;
            }
            // Crossfade to B immediately (no delay)
            playVideo(b, true);
            setActive("B");
        };

        const onEndedB = async () => {
            if (backendReadyRef.current) {
                scheduleSplashCompletion();
                return;
            }
            const ready = await checkHealth();
            if (ready) {
                backendReadyRef.current = true;
                scheduleSplashCompletion();
                return;
            }
            // Crossfade back to A (always muted after first pass)
            playVideo(a, true);
            setActive("A");
        };

        const onError = async () => {
            if (backendReadyRef.current) {
                scheduleSplashCompletion();
                return;
            }

            const ready = await checkHealth();
            if (ready) {
                backendReadyRef.current = true;
                scheduleSplashCompletion();
            }
        };

        a.addEventListener("ended", onEndedA);
        b.addEventListener("ended", onEndedB);
        a.addEventListener("error", onError);
        b.addEventListener("error", onError);
        return () => {
            a.removeEventListener("ended", onEndedA);
            b.removeEventListener("ended", onEndedB);
            a.removeEventListener("error", onError);
            b.removeEventListener("error", onError);
        };
    }, [audioAllowed, checkHealth, playVideo, scheduleSplashCompletion]);

    return (
        <div
            className={`fixed inset-0 z-50 transition-all duration-500 ease-out pointer-events-none ${
                isVisible ? "opacity-100" : "opacity-0"
            } ${isZooming ? "scale-105" : "scale-100"}`}
            style={{ backgroundColor: "#fff", overflow: "hidden" }}
            aria-label="Application loading screen"
        >
            {/* Video A: forward */}
            <video
                ref={videoARef}
                className={`transition-opacity duration-200 ease-linear absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-screen w-auto max-w-none object-cover ${
                    active === "A" ? "opacity-100" : "opacity-0"
                }`}
                playsInline
                preload="auto"
            />

            {/* Video B: reverse */}
            <video
                ref={videoBRef}
                className={`transition-opacity duration-200 ease-linear absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-screen w-auto max-w-none object-cover ${
                    active === "B" ? "opacity-100" : "opacity-0"
                }`}
                playsInline
                preload="auto"
            />
        </div>
    );
}
