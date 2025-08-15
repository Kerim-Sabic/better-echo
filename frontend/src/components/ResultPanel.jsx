import React, { useMemo } from "react";

function clamp01(x) {
  if (Number.isNaN(x)) return NaN;
  return Math.max(0, Math.min(100, x));
}

export default function ResultPanel({ ef, isBusy }) {
  const pct = clamp01(typeof ef === "number" ? ef : NaN);
  const circumference = 2 * Math.PI * 56; // r=56
  const offset = Number.isFinite(pct)
    ? circumference * (1 - pct / 100)
    : circumference;

  const color = useMemo(() => {
    if (!Number.isFinite(pct)) return "#cbd5e1"; // slate-300
    if (pct < 35) return "#ef4444"; // red-500
    if (pct < 50) return "#f59e0b"; // amber-500
    return "#10b981"; // emerald-500
  }, [pct]);

  return (
    <div className="card sticky-col">
      <div className="card-header">
        <div className="card-title">EF Result</div>
        {isBusy && <div className="badge">Analyzing…</div>}
      </div>

      <div className="card-body ef-panel">
        <div className="gauge">
          <svg viewBox="0 0 120 120" className="gauge-svg">
            <circle
              cx="60"
              cy="60"
              r="56"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="56"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "50% 50%",
                strokeDasharray: circumference,
                strokeDashoffset: offset,
                transition: "stroke-dashoffset 450ms ease, stroke 200ms ease",
              }}
            />
          </svg>
          <div className="gauge-center">
            <div className="gauge-value">
              {Number.isFinite(pct) ? `${pct.toFixed(0)}%` : "—"}
            </div>
            <div className="gauge-caption">Ejection Fraction</div>
          </div>
        </div>

        <div className="ef-actions">
          <button
            className="btn"
            disabled={!Number.isFinite(pct)}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${pct.toFixed(1)}%`);
              } catch (e) {
                // ignore
              }
            }}
          >
            Copy result
          </button>
        </div>

        {/* <div className="note">
          This panel mirrors the single-file demo’s gauge/card layout you liked
          (but React-ified). :contentReference[oaicite:7]{(index = 7)}
        </div> */}
      </div>
    </div>
  );
}
