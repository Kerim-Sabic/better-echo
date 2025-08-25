import React from "react";

export default function Viewer({ studyUID }) {
  if (!studyUID) return null;
  const VIEWER_URL = process.env.REACT_APP_VIEWER_URL || "http://localhost:8042/stone-webviewer/index.html";
  const src = `${VIEWER_URL}?study=${encodeURIComponent(studyUID)}`;
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
