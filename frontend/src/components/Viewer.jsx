import React from "react";

export default function Viewer({ studyUID }) {
  if (!studyUID) return null;
  const src = `http://localhost:8042/stone-webviewer/index.html?study=${encodeURIComponent(
    studyUID
  )}`;
  return (
    <div className="viewer-shell">
      <iframe
        title="Stone Web Viewer"
        src={src}
        allow="cross-origin-isolated"
        className="viewer-frame"
      />
    </div>

  );
}
