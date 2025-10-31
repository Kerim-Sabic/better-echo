import React, { useMemo, useState } from "react";
import { Card, CardContent, CardTitle } from "../../../components/ui/card";

/**
 * Props:
 * - dynamicMeasurementsResults: { instances?: Array<Instance> }
 *
 * Instance shape:
 * {
 *   predicted_view: string,
 *   predicted_view_confidence: number,
 *   sop_instance_uid: string,
 *   results: Array<{
 *     status: "DONE" | "SKIPPED" | string,
 *     task: "echonet_dynamic_lv_segmentation" | "measurements_2d" | null,
 *     output_path?: string,
 *     weights?: string,
 *     message?: string,
 *     ui_label?: string
 *   }>
 * }
 */
const MEDIA_BASE_URL = process.env.REACT_APP_API_URL_UPLOADS;

function toUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p) || p.startsWith("/")) return p;
  if (MEDIA_BASE_URL) {
    const base = MEDIA_BASE_URL.replace(/\/+$/, "");
    return `${base}/${p.replace(/^\/+/, "")}`;
  }
  return null; // no absolute URL available
}

export default function AiVideoMeasurements({ dynamicMeasurementsResults }) {
  const instances = dynamicMeasurementsResults?.instances ?? [];

  const stats = useMemo(() => {
    const total = instances.length;
    let done = 0;
    let skipped = 0;
    instances.forEach((inst) => {
      (inst?.results ?? []).forEach((r) => {
        if (r?.status === "DONE") done += 1;
        if (r?.status === "SKIPPED") skipped += 1;
      });
    });
    return { total, done, skipped };
  }, [instances]);

  if (!instances.length) {
    return (
      <Card className="w-full overflow-hidden">
        <CardContent className="p-6 text-sm text-gray-600">
          No dynamic/video measurements available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="overflow-hidden">
        <div className="px-6 pt-5">
          <CardTitle className="text-base">Video Measurements Summary</CardTitle>
        </div>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge>Instances: {stats.total}</Badge>
            <Badge variant="success">Completed tasks: {stats.done}</Badge>
            <Badge variant="muted">Skipped: {stats.skipped}</Badge>
            {MEDIA_BASE_URL ? (
              <Badge variant="info">Media base: {MEDIA_BASE_URL}</Badge>
            ) : (
              <Badge variant="warn">Set REACT_APP_API_URL_UPLOADS for previews</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Instances */}
      {instances.map((inst, idx) => (
        <InstanceCard key={inst?.sop_instance_uid || idx} inst={inst} />
      ))}
    </div>
  );
}

/* -------------------- Instance Card (collapsible) -------------------- */

function InstanceCard({ inst }) {
  const [open, setOpen] = useState(false);

  // Per-instance counts
  const { doneCount, totalCount } = useMemo(() => {
    const total = (inst?.results ?? []).length;
    const done = (inst?.results ?? []).filter((r) => r?.status === "DONE").length;
    return { doneCount: done, totalCount: total };
  }, [inst]);

  return (
    <Card className="overflow-hidden">
      <div className="px-6 pt-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <span>{prettyView(inst?.predicted_view)}</span>
              {inst?.predicted_view_confidence != null && (
                <span className="text-xs text-gray-500">
                  ({pct(inst.predicted_view_confidence)})
                </span>
              )}
            </CardTitle>
            <div className="text-xs text-gray-500 px-1 pt-1">
              SOP Instance UID:{" "}
              <code className="text-[11px] break-all">
                {inst?.sop_instance_uid ?? "—"}
              </code>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="muted">
              Done {doneCount}/{totalCount}
            </Badge>
            <button
              onClick={() => setOpen((s) => !s)}
              className="text-sm px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 inline-flex items-center gap-1"
            >
              <Chevron open={open} />
              {open ? "Hide results" : "Show results"}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <CardContent className="p-0">
          <div className="p-4 space-y-3">
            {(inst?.results ?? []).length ? (
              inst.results.map((r, i) => <ResultRow key={i} r={r} />)
            ) : (
              <div className="text-sm text-gray-600">No outputs for this instance.</div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/* -------------------- rows -------------------- */

function ResultRow({ r }) {
  const task = humanTask(r?.task);
  const url = toUrl(r?.output_path);
  const showPreview = url && /\.mp4($|\?)/i.test(url);

  return (
    <div className="rounded-lg border p-3 bg-gray-50">
      <div className="flex items-center gap-2">
        <StatusPill status={r?.status} />
        <div className="text-sm font-medium">{task}</div>
        {r?.weights ? (
          <span className="text-xs text-gray-500">• weights: {r.weights}</span>
        ) : null}
        <div className="ml-auto text-xs text-gray-500">
          {r?.output_path ? (
            <code className="bg-white/60 rounded px-1 py-0.5">{r.output_path}</code>
          ) : (
            r?.message || ""
          )}
        </div>
      </div>

      {/* Preview with UI label above the video */}
      {r?.status === "DONE" && (
        <>
          {showPreview ? (
            <div className="mt-3">
              {r?.ui_label && (
                <div className="text-sm font-semibold mb-1">{r.ui_label}</div>
              )}
              <video
                className="w-full max-w-[600px] rounded-lg bg-black"
                src={url}
                controls
                preload="metadata"
              />
              <div className="mt-2 text-xs">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-gray-700"
                >
                  Open video in new tab
                </a>
              </div>
            </div>
          ) : r?.output_path ? (
            <div className="mt-2 text-xs text-gray-500">
              No absolute URL available for preview. Configure{" "}
              <code>REACT_APP_API_URL_UPLOADS</code> (or serve absolute URLs) to
              enable inline video.
            </div>
          ) : null}
        </>
      )}

      {/* Skipped message */}
      {r?.status === "SKIPPED" && r?.message && (
        <div className="mt-2 text-xs text-gray-500">{r.message}</div>
      )}
    </div>
  );
}

/* -------------------- small UI helpers -------------------- */

function Chevron({ open }) {
  return (
    <svg
      className={[
        "w-4 h-4 transition-transform",
        open ? "rotate-180" : "rotate-0",
      ].join(" ")}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Badge({ children, variant = "default" }) {
  const variants = {
    default: "border-gray-300 bg-white text-gray-700",
    success: "border-emerald-300 bg-emerald-50 text-emerald-800",
    warn: "border-amber-300 bg-amber-50 text-amber-800",
    muted: "border-gray-200 bg-gray-100 text-gray-600",
    info: "border-blue-300 bg-blue-50 text-blue-800",
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

function StatusPill({ status }) {
  const s = String(status || "").toUpperCase();
  const styles =
    s === "DONE"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : s === "SKIPPED"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <span className={["text-xs px-2 py-0.5 rounded border", styles].join(" ")}>
      {s || "UNKNOWN"}
    </span>
  );
}

/* -------------------- format helpers -------------------- */

function pct(p, digits = 1) {
  if (p == null || Number.isNaN(p)) return "—";
  return `${(Number(p) * 100).toFixed(digits)}%`;
}

function prettyView(v) {
  if (!v) return "—";
  return String(v)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

function humanTask(t) {
  const map = {
    echonet_dynamic_lv_segmentation: "LV Segmentation (EchoNet-Dynamic)",
    measurements_2d: "2D Measurements (Keypoint Detection)",
  };
  return map[t] || (t ? t.replace(/_/g, " ") : "Task");
}

