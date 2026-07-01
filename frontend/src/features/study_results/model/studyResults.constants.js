export const NO_DERIVED_DICOM_VIEWER_TOKEN = "no-derived-dicom";

function hashToken(value) {
  let hash = 0x811c9dc5;
  const input = String(value || "");

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function buildBoundedToken(prefix, parts) {
  const identity = parts.filter(Boolean).join("\u001f");
  return `${prefix}-${identity.length.toString(36)}-${hashToken(identity)}`;
}

export function buildDerivedMediaViewerRefreshToken(tokens) {
  const normalizedTokens = Array.from(
    new Set((Array.isArray(tokens) ? tokens : []).filter(Boolean).map(String))
  ).sort();

  if (normalizedTokens.length === 0) {
    return NO_DERIVED_DICOM_VIEWER_TOKEN;
  }

  return buildBoundedToken("derived-media", normalizedTokens);
}

export function buildViewerCacheBuster({
  locationKey,
  viewerRefreshToken,
}) {
  const normalizedLocationKey = locationKey || "location";
  const normalizedViewerRefreshToken =
    viewerRefreshToken || NO_DERIVED_DICOM_VIEWER_TOKEN;

  return buildBoundedToken("viewer", [
    normalizedLocationKey,
    normalizedViewerRefreshToken,
  ]);
}
