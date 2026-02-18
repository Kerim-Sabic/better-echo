import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export default function Viewer({ studyUID }) {
  const location = useLocation();
  if (!studyUID) return null;

  const base = String(process.env.REACT_APP_OHIF_BASE_URL || "").replace(/\/+$/, "");
  if (!base) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/80">
        OHIF base URL is not configured.
      </div>
    );
  }

  const viewerBase = base.endsWith("/viewer") ? base : `${base}/viewer`;
  const configUrlRaw = String(process.env.REACT_APP_OHIF_CONFIG_URL || `${base}/orthanc-standalone.json`);
  const cacheBuster = useMemo(() => Date.now().toString(), [studyUID, location.key]);
  const configUrl = configUrlRaw.includes("?")
    ? `${configUrlRaw}&_cb=${cacheBuster}`
    : `${configUrlRaw}?_cb=${cacheBuster}`;

  const params = new URLSearchParams();
  // Support both query names across OHIF variants.
  params.set("configUrl", configUrl);
  params.set("url", configUrl);
  params.set("studyInstanceUIDs", studyUID);
  params.set("StudyInstanceUIDs", studyUID);
  params.set("_cb", cacheBuster);

  const src = `${viewerBase}?${params.toString()}`;

  return (
    <iframe
      key={`${studyUID}-${location.key}-${cacheBuster}`}
      title="OHIF Viewer"
      src={src}
      allow="cross-origin-isolated"
      className="w-full h-full border-none"
    />
  );
}
