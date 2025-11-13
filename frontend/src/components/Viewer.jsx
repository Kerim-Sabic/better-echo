export default function Viewer({ studyUID }) {
  if (!studyUID) return null;

  const VIEWER_URL = process.env.REACT_APP_VIEWER_URL;
  const src = `${VIEWER_URL}?study=${encodeURIComponent(studyUID)}`;

  return (
    <iframe
      title="Stone Web Viewer"
      src={src}
      allow="cross-origin-isolated"
      className="w-full h-full border-none"
    />
  );
}
