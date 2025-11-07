// src/features/StudyResults/components/AiMeasurements.jsx
import React, { useMemo } from "react";
import { Card, CardContent, CardTitle } from "../../../components/ui/card";

/**
 * Props:
 * - panechoEchoprimeResults: {
 *     integrated_tasks?: Record<string, {
 *       panecho_value_or_prob?: number|null,
 *       echoprime_value_or_prob?: number|null,
 *       integrated_value?: number|null,
 *       integrated_label?: string|null,
 *       units?: string|null,
 *       note?: string|null
 *     }>,
 *     // Back-compat shapes:
 *     panecho_echoprime_overlapping_tasks?: Record<string, any>,
 *     panecho_only_tasks?: Record<string, any>,
 *     echoprime_only_tasks?: Record<string, any>,
 *     disagreement_flags?: Record<string, any>
 *   }
 */
export default function AiMeasurements({ panechoEchoprimeResults }) {
  const {
    integrated_tasks,
    panecho_echoprime_overlapping_tasks,
    panecho_only_tasks,
    echoprime_only_tasks,
    disagreement_flags,
  } = panechoEchoprimeResults || {};

  const hasIntegrated = !!integrated_tasks && Object.keys(integrated_tasks).length > 0;

  // --------- Integrated rows (preferred) ----------
  const integratedRows = useMemo(() => {
    if (!hasIntegrated) return [];
    return Object.entries(integrated_tasks).map(([name, obj]) => ({
      key: name,
      label: prettyName(name),
      units: obj?.units ?? null,
      integratedValue: obj?.integrated_value ?? null,
      integratedLabel: obj?.integrated_label ?? null,
      panechoValOrProb: obj?.panecho_value_or_prob ?? null,
      echoprimeValOrProb: obj?.echoprime_value_or_prob ?? null,
      note: obj?.note ?? null,
    }));
  }, [integrated_tasks, hasIntegrated]);

  // --------- Back-compat rows (shown only if no 'integrated_tasks') ----------
  const legacyOverlappingRows = useMemo(() => {
    if (hasIntegrated || !panecho_echoprime_overlapping_tasks) return [];
    return Object.entries(panecho_echoprime_overlapping_tasks).map(([name, obj]) => ({
      key: name,
      label: prettyName(name),
      units: obj?.units ?? null,
      panechoValOrProb:
        obj?.from_panecho_abnormal_prob ?? obj?.from_panecho ?? null,
      echoprimeValOrProb:
        obj?.to_echoprime_prob ?? obj?.to_echoprime ?? null,
      // Provide a reasonable "integrated" presentation for old structure
      integratedValue: obj?.to_echoprime ?? obj?.from_panecho ?? null,
      integratedLabel: obj?.flag_large_gap ? "⚠ Gap" : null,
      note: obj?.note ?? null,
    }));
  }, [hasIntegrated, panecho_echoprime_overlapping_tasks]);

  const legacyPanEchoOnlyRows = useMemo(() => {
    if (hasIntegrated || !panecho_only_tasks) return [];
    return Object.entries(panecho_only_tasks).map(([name, obj]) => {
      const inferredUnits = obj?.units ?? null;
      const [value, label] = normalizePanechoOnly(obj);
      return {
        key: `panecho_${name}`,
        label: prettyName(name),
        units: inferredUnits,
        panechoValOrProb: value,
        echoprimeValOrProb: null,
        integratedValue: value,
        integratedLabel: label,
        note: null,
      };
    });
  }, [hasIntegrated, panecho_only_tasks]);

  const legacyEchoPrimeOnlyRows = useMemo(() => {
    if (hasIntegrated || !echoprime_only_tasks) return [];
    return Object.entries(echoprime_only_tasks).map(([name, obj]) => ({
      key: `ep_${name}`,
      label: prettyName(name),
      units: obj?.units ?? null,
      panechoValOrProb: null,
      echoprimeValOrProb: obj?.probability_present ?? null,
      integratedValue: null,
      integratedLabel: binaryLabel(obj?.probability_present),
      note: null,
    }));
  }, [hasIntegrated, echoprime_only_tasks]);

  const rows = useMemo(() => {
    if (hasIntegrated) return integratedRows;
    // Combine legacy groups in one list
    return [
      ...legacyOverlappingRows,
      ...legacyPanEchoOnlyRows,
      ...legacyEchoPrimeOnlyRows,
    ];
  }, [
    hasIntegrated,
    integratedRows,
    legacyOverlappingRows,
    legacyPanEchoOnlyRows,
    legacyEchoPrimeOnlyRows,
  ]);

  if (!rows.length) {
    return (
      <Card className="w-full overflow-hidden">
        <CardContent className="p-6 text-sm text-gray-600">
          No measurements available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="overflow-hidden">
        <div className="px-6 pt-5">
          <CardTitle className="text-base">AI Measurements</CardTitle>
        </div>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Pill>Total measurements: {rows.length}</Pill>
            {hasIntegrated ? (
              <Pill variant="success">Integrated view</Pill>
            ) : (
              <Pill variant="muted">Legacy view</Pill>
            )}
            {disagreement_flags && Object.keys(disagreement_flags).length > 0 && (
              <Pill variant="warn">
                Disagreements: {Object.keys(disagreement_flags).length}
              </Pill>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b bg-gray-50">
              <Th>Measurement</Th>
              <Th>Integrated</Th>
              <Th>Units</Th>
              <Th>PanEcho</Th>
              <Th>EchoPrime</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <Td className="font-medium">{r.label}</Td>

                <Td>
                  {r.integratedValue != null
                    ? fmtNumber(r.integratedValue)
                    : r.integratedLabel || "—"}
                </Td>

                <Td className="text-gray-500">{r.units || "—"}</Td>

                <Td>{fmtMaybeValueOrProb(r.panechoValOrProb)}</Td>

                <Td>{fmtMaybeValueOrProb(r.echoprimeValOrProb)}</Td>

                <Td className="text-xs text-gray-500">{r.note || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------- helpers -------------------- */

function Th({ children, className = "" }) {
  return (
    <th className={["px-3 py-2 text-xs font-semibold uppercase tracking-wide", className].join(" ")}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }) {
  return <td className={["px-3 py-2 align-top", className].join(" ")}>{children}</td>;
}

function Pill({ children, variant = "default" }) {
  const variants = {
    default: "border-gray-300 bg-white text-gray-700",
    success: "border-emerald-300 bg-emerald-50 text-emerald-800",
    warn: "border-amber-300 bg-amber-50 text-amber-800",
    muted: "border-gray-200 bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border",
        variants[variant] || variants.default,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function prettyName(s) {
  if (!s) return "—";
  return String(s)
    .replace(/__/g, "_")
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function fmtNumber(n, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  // keep integers as-is, otherwise show toFixed
  return Number.isInteger(x) ? String(x) : x.toFixed(digits);
}

function fmtProb(p, digits = 0) {
  if (p == null || Number.isNaN(Number(p))) return "—";
  return `${(Number(p) * 100).toFixed(digits)}%`;
}

function looksLikeProbability(val) {
  // Treat 0..1 as probability (not perfect, but good heuristic)
  if (val == null) return false;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function fmtMaybeValueOrProb(v) {
  if (v == null) return "—";
  return looksLikeProbability(v) ? fmtProb(v, v === 0 || v === 1 ? 0 : 1) : fmtNumber(v);
}

function binaryLabel(p) {
  if (p == null) return null;
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  // Simple thresholding; adjust if you have your own threshold
  return n >= 0.5 ? "Present" : "Absent";
}

/**
 * Normalize older PanEcho-only task shapes:
 * - kind: 'regression' -> value
 * - kind: 'binary'/'binary_like' -> probability_present (+positive_label)
 * - kind: 'multiclass' -> label
 */
function normalizePanechoOnly(obj) {
  if (!obj || typeof obj !== "object") return [null, null];
  const kind = obj.kind || null;
  if (kind === "regression") {
    return [obj.value ?? null, null];
  }
  if (kind === "binary" || kind === "binary_like") {
    const p = obj.probability_present ?? null;
    return [p, binaryLabel(p)];
  }
  if (kind === "multiclass") {
    return [null, obj.label ?? null];
  }
  // Fallback: try common fields
  if ("value" in obj) return [obj.value, null];
  if ("label" in obj) return [null, obj.label];
  if ("probability_present" in obj) return [obj.probability_present, binaryLabel(obj.probability_present)];
  return [null, null];
}
