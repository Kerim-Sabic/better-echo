export const NO_DERIVED_DICOM_VIEWER_TOKEN = "no-derived-dicom";

export function buildViewerCacheBuster({
  studyUid,
  locationKey,
  viewerRefreshToken,
}) {
  const normalizedStudyUid = studyUid || "study";
  const normalizedLocationKey = locationKey || "location";
  const normalizedViewerRefreshToken =
    viewerRefreshToken || NO_DERIVED_DICOM_VIEWER_TOKEN;

  return `${normalizedStudyUid}-${normalizedLocationKey}-${normalizedViewerRefreshToken}`;
}
