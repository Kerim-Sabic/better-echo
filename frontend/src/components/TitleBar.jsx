import React, { useEffect, useState, useCallback } from "react";

export const TITLEBAR_HEIGHT = 40; // in px

export default function TitleBar() {
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

  return (
    <div
      onDoubleClick={onDoubleClick}
      className="fixed top-0 left-0 right-0 bg-white flex items-center justify-end px-2 z-[1000]"
      style={{ height: TITLEBAR_HEIGHT, WebkitAppRegion: "drag", userSelect: "none" }}
    >
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" }}>
        <WinButton aria-label="Minimize" onClick={minimize}>
          <svg className="w-[10px] h-[10px] text-slate-600" viewBox="0 0 10 10">
            <rect x="1" y="5" width="8" height="1" rx="0.5" fill="currentColor" />
          </svg>
        </WinButton>
        <WinButton aria-label={isMax ? "Restore" : "Maximize"} onClick={toggleMaximize}>
          {isMax ? (
            <svg className="w-[10px] h-[10px] text-slate-600" viewBox="0 0 10 10">
              <rect x="2.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="1.5" y="1.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg className="w-[10px] h-[10px] text-slate-600" viewBox="0 0 10 10">
              <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </WinButton>
        <WinButton aria-label="Close" onClick={close} hover="close">
          <svg className="w-[10px] h-[10px] text-slate-600" viewBox="0 0 10 10">
            <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1" />
          </svg>
        </WinButton>
      </div>
    </div>
  );
}

function WinButton({ children, onClick, hover, ...rest }) {
  const base = "inline-flex items-center justify-center h-8 w-8 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors";
  const hoverCls = hover === "close" ? "hover:bg-red-50" : "hover:bg-slate-100";
  return (
    <button type="button" onClick={onClick} className={`${base} ${hoverCls}`} {...rest}>
      {children}
    </button>
  );
}
