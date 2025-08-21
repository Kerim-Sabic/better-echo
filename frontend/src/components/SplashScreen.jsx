// src/components/SplashScreen.jsx
import React, { useEffect, useState } from "react";
// If the image is in src/assets:
import heroBackground from "../assets/hero-background.jpg"; // adjust the path as needed
// If you keep it in /public, delete the line above and use: const heroBackground = "/hero-background.jpg";

import logo from "../assets/horalix_logo.png"; // or move file to /public and use "/horalix_logo.png"

const SplashScreen = ({ onComplete }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(() => onComplete && onComplete(), 500); // allow fade-out
        }, 3000);

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div
            className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-500 ${
                isVisible ? "opacity-100" : "opacity-0"
            } bg-white`}
            style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.9)), url(${heroBackground})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
            role="img"
            aria-label="Horalix Echo application loading screen"
        >
            <div className="text-center">
                {/* Logo + wordmark */}
                <div className="mb-8 flex items-center justify-center">
                    <div className="relative">
                        <img
                            src={logo}
                            alt="Horalix Echo Logo"
                            className="h-20 w-20 heartbeat"
                            role="img"
                            aria-label="Horalix company logo"
                        />
                        <div className="absolute inset-0 h-20 w-20 rounded-full bg-blue-600/20 animate-pulse" />
                    </div>
                    <div className="ml-4">
                        <h1 className="text-4xl font-bold text-blue-700">Horalix</h1>
                        <h2 className="text-2xl font-light text-blue-700/80">Echo</h2>
                    </div>
                </div>

                {/* Tagline */}
                <p className="text-xl text-gray-500 font-medium">AI-Powered Cardiac Insights</p>

                {/* Loading bar */}
                <div className="mt-8 flex justify-center" role="progressbar" aria-label="Application loading">
                    <div className="w-32 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 animate-pulse rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SplashScreen;
