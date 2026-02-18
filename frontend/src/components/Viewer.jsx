export default function Viewer({ studyUID }) {
  if (!studyUID) return null;

  const base = String(process.env.REACT_APP_OHIF_BASE_URL || "").replace(/\/+$/, "");
  if (!base) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/80">
        OHIF base URL is not configured.
      </div>
    );
  }

  const viewerBase = base.endsWith("/viewer") ? base : `${base}/viewer`; // adds /viewer to the base
  const configUrl = String(process.env.REACT_APP_OHIF_CONFIG_URL || `${base}/orthanc-standalone.json`);

  const params = new URLSearchParams();
  params.set("url", configUrl);
  params.set("studyInstanceUIDs", studyUID);
  params.set("StudyInstanceUIDs", studyUID);

  const src = `${viewerBase}?${params.toString()}`;

  return (
    <iframe
      title="OHIF Viewer"
      src={base}
      allow="cross-origin-isolated"
      className="w-full h-full border-none"
    />
  );
}
