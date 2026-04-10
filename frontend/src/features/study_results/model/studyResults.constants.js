export const DYNAMIC_MEASUREMENTS_PENDING_VIEWER_TOKEN =
  "dynamic-measurements-not-ready";

export function buildViewerCacheBuster({
  studyUid,
  locationKey,
  viewerRefreshToken,
}) {
  const normalizedStudyUid = studyUid || "study";
  const normalizedLocationKey = locationKey || "location";
  const normalizedViewerRefreshToken =
    viewerRefreshToken || DYNAMIC_MEASUREMENTS_PENDING_VIEWER_TOKEN;

  return `${normalizedStudyUid}-${normalizedLocationKey}-${normalizedViewerRefreshToken}`;
}
