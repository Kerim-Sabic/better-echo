import React, { useEffect, useState, useCallback } from "react";

export const TITLEBAR_HEIGHT = 40; // px

export default function TitleBar({ variant = "light" }) {
    const [isMax, setIsMax] = useState(false);

    useEffect(() => {
        let off = () => {};
        (async () => {
        try {
            const v = await window.electronAPI?.windowControls?.isMaximized?.();
            if (typeof v === "boolean") setIsMax(v);
        } catch {}
        try {
            off = window.electronAPI?.windowControls?.onMaximizeChange?.((val) => setIsMax(Boolean(val))) || (() => {});
        } catch {}
        })();
        return () => { try { off(); } catch {} };
    }, []);

    const minimize = useCallback(() => {
        try { window.electronAPI?.windowControls?.minimize?.(); } catch {}
    }, []);
    const toggleMaximize = useCallback(() => {
        try { window.electronAPI?.windowControls?.toggleMaximize?.(); } catch {}
    }, []);
    const close = useCallback(() => {
        try { window.electronAPI?.windowControls?.close?.(); } catch {}
    }, []);

    // Double-click to toggle maximize
    const onDoubleClick = useCallback(() => {
        toggleMaximize();
    }, [toggleMaximize]);

    const isSplash = variant === "splash";
    const isDark = variant === "dark";
    const barClass = [
        "fixed top-0 left-0 right-0 flex items-center justify-end px-2 z-[1000]",
        "transition-colors duration-300",
        isSplash ? "bg-transparent text-white" : isDark ? "bg-slate-950 text-white" : "bg-white text-slate-700",
    ].join(" ");

    return (
        <div
        onDoubleClick={onDoubleClick}
        className={barClass}
        style={{ height: TITLEBAR_HEIGHT, WebkitAppRegion: "drag", userSelect: "none" }}
        >
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" }}>
            <WinButton aria-label="Minimize" onClick={minimize} splash={isSplash}>
            <svg className="w-[10px] h-[10px]" viewBox="0 0 10 10">
                <rect x="1" y="5" width="8" height="1" rx="0.5" fill="currentColor" />
            </svg>
            </WinButton>
            <WinButton aria-label={isMax ? "Restore" : "Maximize"} onClick={toggleMaximize} splash={isSplash}>
            {isMax ? (
                <svg className="w-[10px] h-[10px]" viewBox="0 0 10 10">
                <rect x="2.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect x="1.5" y="1.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
            ) : (
                <svg className="w-[10px] h-[10px]" viewBox="0 0 10 10">
                <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
            )}
            </WinButton>
            <WinButton aria-label="Close" onClick={close} hover="close" splash={isSplash}>
            <svg className="w-[10px] h-[10px]" viewBox="0 0 10 10">
                <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1" />
            </svg>
            </WinButton>
        </div>
        </div>
    );
}

function WinButton({ children, onClick, hover, splash, ...rest }) {
    const base = "inline-flex items-center justify-center h-8 w-8 rounded focus:outline-none focus:ring-2 transition-colors duration-200";
    const focusRing = splash ? "focus:ring-white/60" : "focus:ring-blue-300";
    const hoverBg = hover === "close"
        ? (splash ? "hover:bg-red-500/20" : "hover:bg-destructive/10")
        : (splash ? "hover:bg-white/10" : "hover:bg-muted/60");
    return (
        <button type="button" onClick={onClick} className={`${base} ${focusRing} ${hoverBg}`} {...rest}>
        {children}
        </button>
    );
}
