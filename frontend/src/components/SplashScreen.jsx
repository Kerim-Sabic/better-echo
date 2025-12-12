import { useEffect, useRef, useState } from "react";
import { getBackendUrl } from "../config/api";

export default function SplashScreen({ onComplete }) {
    const videoARef = useRef(null); // forward
    const videoBRef = useRef(null); // reverse
    const [isVisible, setIsVisible] = useState(true);
    const [isZooming, setIsZooming] = useState(false);
    const [active, setActive] = useState("A"); // "A" | "B"
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

    function playVideo(el, muted) {
        if (!el) return;
        el.muted = !!muted;
        try {
            el.currentTime = 0;
        } catch {}
        el.play().catch(() => {});
    }

    // Initialize both videos and start forward pass
    useEffect(() => {
        const playedBefore = typeof window !== "undefined" && localStorage.getItem("splashAudioPlayed") === "true";
        const allowAudio = !playedBefore;
        setAudioAllowed(allowAudio);

        const a = videoARef.current;
        const b = videoBRef.current;
        if (!a || !b) return;

        // Set sources and preload
        a.src = "/horalix-splash-video.mp4";
        b.src = "/horalix-splash-video-reversed.mp4";
        try { a.load(); } catch {}
        try { b.load(); } catch {}

        // Start forward (A). Allow audio only on first ever run
        playVideo(a, !allowAudio);
        // Keep reverse (B) preloaded + muted
        b.muted = true;
        setActive("A");
    }, []);

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
            const ready = await checkHealth();
            if (ready) {
                setIsZooming(true);
                setIsVisible(false);
                setTimeout(() => onComplete?.(), 500);
                return;
            }
            // Crossfade to B immediately (no delay)
            playVideo(b, true);
            setActive("B");
        };

        const onEndedB = async () => {
            const ready = await checkHealth();
            if (ready) {
                setIsZooming(true);
                setIsVisible(false);
                setTimeout(() => onComplete?.(), 500);
                return;
            }
            // Crossfade back to A (always muted after first pass)
            playVideo(a, true);
            setActive("A");
        };

        a.addEventListener("ended", onEndedA);
        b.addEventListener("ended", onEndedB);
        return () => {
            a.removeEventListener("ended", onEndedA);
            b.removeEventListener("ended", onEndedB);
        };
    }, [audioAllowed, onComplete]);

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
