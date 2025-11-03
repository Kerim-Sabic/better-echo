import React, { useState, useMemo } from "react";
import { Card, CardContent, CardTitle } from "../../../components/ui/card";

/**
 * Props:
 * - panechoEchoprimeResults: object
 */
export default function AiMeasurements({ panechoEchoprimeResults }) {
  const {
    panecho_echoprime_overlapping_tasks: overlap = {},
    panecho_only_tasks: panechoOnly = {},
    echoprime_only_tasks: echoprimeOnly = {},
    disagreement_flags: flags = {},
  } = panechoEchoprimeResults ?? {};

  const hasAny =
    !!panechoEchoprimeResults &&
    (Object.keys(overlap).length ||
      Object.keys(panechoOnly).length ||
      Object.keys(echoprimeOnly).length);

  if (!hasAny) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6 text-sm text-gray-600">
          No AI measurements available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Highlights (optional, shows common headline metrics when present) */}
      <Highlights overlap={overlap} panechoOnly={panechoOnly} />

      {/* PanEcho + EchoPrime (overlapping) */}
      <SectionCard title="PanEcho + EchoPrime (Overlapping Tasks)">
        <OverlapTable data={overlap} />
      </SectionCard>

      {/* PanEcho only */}
      <SectionCard title="PanEcho-only Measurements">
        <PanechoOnlyTable data={panechoOnly} />
      </SectionCard>

      {/* EchoPrime only */}
      <SectionCard title="EchoPrime-only Findings">
        <EchoprimeOnlyTable data={echoprimeOnly} />
      </SectionCard>

      {/* Disagreement flags (if any) */}
      {flags && Object.keys(flags).length > 0 && (
        <SectionCard title="Disagreement Flags">
          <pre className="text-xs bg-gray-50 rounded p-3 overflow-auto">
            {JSON.stringify(flags, null, 2)}
          </pre>
        </SectionCard>
      )}
    </div>
  );
}

/* -------------------- Sections -------------------- */

function Highlights({ overlap, panechoOnly }) {
  const ef = overlap?.EF_percent;
  const pap = overlap?.pulmonary_pressure_mmHg__RVSP_vs_PAP;
  const lv = {
    edv: panechoOnly?.LVEDV,
    esv: panechoOnly?.LVESV,
    sv: panechoOnly?.LVSV,
    gls: panechoOnly?.GLS,
  };

  const items = useMemo(() => {
    const arr = [];
    if (ef) {
      arr.push({
        label: "EF",
        value: `${fmtNum(ef.to_echoprime ?? ef.from_panecho)}${ef.units || "%"}`,
        sub:
          ef.from_panecho != null && ef.to_echoprime != null
            ? `${fmtNum(ef.from_panecho)} → ${fmtNum(ef.to_echoprime)} ${ef.units || "%"}`
            : ef.range || "",
        warn: !!ef.flag_large_gap,
      });
    }
    if (pap) {
      arr.push({
        label: "Pulmonary Pressure",
        value: `${fmtNum(pap.to_echoprime_PAP ?? pap.from_panecho_RVSP)} ${pap.units || "mmHg"}`,
        sub:
          pap.from_panecho_RVSP != null && pap.to_echoprime_PAP != null
            ? `${fmtNum(pap.from_panecho_RVSP)} → ${fmtNum(pap.to_echoprime_PAP)} ${pap.units || "mmHg"}`
            : pap.range || "",
        warn: !!pap.flag_large_gap,
      });
    }
    if (lv.edv?.value != null) {
      arr.push({
        label: "LVEDV",
        value: `${fmtNum(lv.edv.value)} ${lv.edv.units || ""}`.trim(),
      });
    }
    if (lv.esv?.value != null) {
      arr.push({
        label: "LVESV",
        value: `${fmtNum(lv.esv.value)} ${lv.esv.units || ""}`.trim(),
      });
    }
    if (lv.sv?.value != null) {
      arr.push({
        label: "LVSV",
        value: `${fmtNum(lv.sv.value)} ${lv.sv.units || ""}`.trim(),
      });
    }
    if (lv.gls?.value != null) {
      arr.push({
        label: "GLS",
        value: `${fmtNum(lv.gls.value)} ${lv.gls.units || "%"}`.trim(),
      });
    }
    return arr;
  }, [ef, pap, lv.edv, lv.esv, lv.sv, lv.gls]);

  if (!items.length) return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-6 pt-5">
        <CardTitle className="text-base">Highlights</CardTitle>
      </div>
      <CardContent className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((it, idx) => (
            <div
              key={idx}
              className={[
                "rounded-lg border p-3",
                it.warn ? "border-amber-300 bg-amber-50/60" : "bg-gray-50",
              ].join(" ")}
            >
              <div className="text-xs text-gray-500">{it.label}</div>
              <div className="text-lg font-semibold">{it.value}</div>
              {it.sub ? (
                <div className="text-[11px] text-gray-500 mt-0.5">{it.sub}</div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, children }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-6 pt-5">
        <CardTitle className="text-base">{title}</CardTitle>
      </div>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function OverlapTable({ data }) {
  const rows = Object.entries(data || {});
  if (!rows.length) {
    return <EmptyRows text="No overlapping tasks." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <Th>Metric</Th>
            <Th>PanEcho</Th>
            <Th>EchoPrime</Th>
            <Th>Range</Th>
            <Th>Units</Th>
            <Th>Gap</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(([key, v]) => {
            const panecho =
              v?.from_panecho ?? v?.from_panecho_abnormal_prob ?? v?.from_panecho_RVSP;
            const echoprime =
              v?.to_echoprime ?? v?.to_echoprime_prob ?? v?.to_echoprime_PAP;
            const isProb =
              "from_panecho_abnormal_prob" in (v || {}) || "to_echoprime_prob" in (v || {});
            const panechoTxt = isProb ? pct(panecho) : fmtNum(panecho);
            const echoTxt = isProb ? pct(echoprime) : fmtNum(echoprime);
            const units = v?.units || (isProb ? "" : undefined);

            return (
              <tr key={key} className="hover:bg-gray-50">
                <Td className="font-medium">{prettyKey(key)}</Td>
                <Td>{panechoTxt}</Td>
                <Td>{echoTxt}</Td>
                <Td className="text-gray-500">{v?.range ?? ""}</Td>
                <Td>{units || ""}</Td>
                <Td>
                  {v?.flag_large_gap ? (
                    <span className="inline-block text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      Large gap
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PanechoOnlyTable({ data }) {
  const rows = Object.entries(data || {});
  if (!rows.length) return <EmptyRows text="No PanEcho-only measurements." />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <Th>Metric</Th>
            <Th>Value</Th>
            <Th>Units</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(([key, v]) => {
            const kind = v?.kind;
            if (kind === "regression") {
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <Td className="font-medium">{prettyKey(key)}</Td>
                  <Td>{fmtNum(v?.value)}</Td>
                  <Td>{v?.units || ""}</Td>
                  <Td className="text-gray-500">—</Td>
                </tr>
              );
            }

            if (kind === "binary") {
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <Td className="font-medium">{prettyKey(key)}</Td>
                  <Td>{pct(v?.probability_present)}</Td>
                  <Td>{v?.positive_label ? `P(label=${v.positive_label})` : ""}</Td>
                  <Td className="text-gray-500">Binary</Td>
                </tr>
              );
            }

            if (kind === "multiclass") {
              return <MulticlassRow key={key} name={key} v={v} />;
            }

            // fallback
            return (
              <tr key={key} className="hover:bg-gray-50">
                <Td className="font-medium">{prettyKey(key)}</Td>
                <Td colSpan={3}>
                  <code className="text-xs bg-gray-50 rounded px-1 py-0.5">
                    {JSON.stringify(v)}
                  </code>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EchoprimeOnlyTable({ data }) {
  const rows = Object.entries(data || {});
  if (!rows.length) return <EmptyRows text="No EchoPrime-only findings." />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <Th>Finding</Th>
            <Th>Probability</Th>
            <Th>Notes</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(([key, v]) => {
            // kind can be 'binary_like', treat like probability_present
            const p = v?.probability_present;
            return (
              <tr key={key} className="hover:bg-gray-50">
                <Td className="font-medium">{prettyKey(key)}</Td>
                <Td>{pct(p)}</Td>
                <Td className="text-gray-500">{v?.kind || "—"}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------- Complex Row -------------------- */

function MulticlassRow({ name, v }) {
  const [open, setOpen] = useState(false);
  const dist = v?.probs || {};
  const classes = Array.isArray(v?.classes) ? v.classes : Object.keys(dist || {});
  const rows = classes.map((c) => [c, dist?.[c]]).filter(([_, p]) => p != null);

  return (
    <>
      <tr className="hover:bg-gray-50">
        <Td className="font-medium">{prettyKey(name)}</Td>
        <Td>
          <span className="font-medium">{v?.label ?? "—"}</span>
          {v?.confidence != null && (
            <span className="ml-2 text-xs text-gray-500">({pct(v.confidence)})</span>
          )}
        </Td>
        <Td>—</Td>
        <Td>
          <button
            onClick={() => setOpen((s) => !s)}
            className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50"
          >
            {open ? "Hide distribution" : "Show distribution"}
          </button>
        </Td>
      </tr>
      {open && (
        <tr className="bg-gray-50/60">
          <Td colSpan={4}>
            {rows.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {rows.map(([cls, p]) => (
                  <div key={cls} className="flex items-center gap-2">
                    <div className="text-xs text-gray-600 w-40 truncate">{cls}</div>
                    <div className="flex-1 h-2 rounded bg-gray-200 overflow-hidden">
                      <div
                        className="h-2 bg-gray-700"
                        style={{ width: `${Math.min(100, Math.max(0, (p ?? 0) * 100))}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 w-10 text-right">
                      {pct(p)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No class probabilities provided.</div>
            )}
          </Td>
        </tr>
      )}
    </>
  );
}

/* -------------------- Small UI helpers -------------------- */

function Th({ children }) {
  return <th className="text-left font-medium px-3 py-2">{children}</th>;
}

function Td({ children, className = "", ...rest }) {
  return (
    <td className={["px-3 py-2 align-top", className].join(" ")} {...rest}>
      {children}
    </td>
  );
}

function EmptyRows({ text }) {
  return (
    <div className="p-4 text-sm text-gray-600">
      {text}
    </div>
  );
}

/* -------------------- Format helpers -------------------- */

function fmtNum(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const fixed = Number(n).toFixed(digits);
  // trim trailing zeros but keep one leading zero for <1
  return fixed.replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/g, "");
}

function pct(p, digits = 1) {
  if (p == null || Number.isNaN(p)) return "—";
  return `${fmtNum(Number(p) * 100, digits)}%`;
}

function prettyKey(k) {
  if (!k) return "";
  // Friendly overrides
  const map = {
    EF_percent: "Ejection Fraction (EF)",
    pulmonary_pressure_mmHg__RVSP_vs_PAP: "Pulmonary Pressure (RVSP vs PAP)",
    AORoot: "Aortic Root",
    "AVPkVel(m|s)": "Aortic Valve Peak Velocity",
    "RADimensionM-L(cm)": "RA Dimension (M-L)",
  };
  if (map[k]) return map[k];
  return String(k)
    .replace(/_/g, " ")
    .replace(/-/g, " – ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
