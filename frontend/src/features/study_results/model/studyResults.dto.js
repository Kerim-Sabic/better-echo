import { toArray, toObject, toNullableString } from "@/general_components/utility/dataShapeUtils";


function deriveCombinedState(responseStatus, backendStatus) {
  if (responseStatus === 202 || backendStatus === "pending") {
    return "pending";
  }

  if (responseStatus === 404) {
    return "not_found";
  }

  if (backendStatus === "complete") {
    return "ready";
  }

  if (backendStatus === "failed") {
    return "failed";
  }

  return "error";
}

function formatPanechoEchoprimeDisplayDto(rawDisplay) {
  const display = toObject(rawDisplay);
  const measurementSections = toArray(display.Measurements).filter(
    section => toArray(section?.items).length > 0
  );

  return {
    mainMeasurements: toArray(display.mainMeasurements),
    measurementSections,
    hasMainMeasurements: Boolean(display.hasMainMeasurements),
    hasMeasurements: Boolean(display.hasMeasurements),
    totalMeasurements:
      typeof display.totalMeasurements === "number" ? display.totalMeasurements : null,
  };
}

function formatPanechoEchoprimeResultsDto(rawResults) {
  const results = toObject(rawResults);

  return {
    editBaselines: toObject(results.edit_baselines),
    overrides: toObject(results.overrides),
    overridesUpdatedAt: results.overrides_updated_at ?? null,
    display: formatPanechoEchoprimeDisplayDto(results.display),
  };
}

function buildDynamicMeasurementsViewerRefreshToken(rawDynamicMeasurementsResults) {
  const payload = toObject(rawDynamicMeasurementsResults);
  const instances = toArray(payload.instances);
  const seenTokens = new Set();

  const tokens = instances.flatMap(instance => {
    const results = toArray(instance?.results);

    return results
      .map(result => toObject(result?.derived_dicom))
      .map(derivedDicom => {
        return (
          toNullableString(derivedDicom.orthanc_instance_id) ||
          toNullableString(derivedDicom.series_instance_uid) ||
          toNullableString(derivedDicom.sop_instance_uid) ||
          toNullableString(derivedDicom.relative_dicom_path)
        );
      })
      .filter(Boolean)
      .filter(token => {
        if (seenTokens.has(token)) {
          return false;
        }

        seenTokens.add(token);
        return true;
      });
  });

  return tokens.length > 0 ? tokens.sort().join("|") : "no-derived-dicom";
}

export function formatPanechoEchoprimeCombinedResultsDto(rawApiResponse) {
  const response = toObject(rawApiResponse);
  const responseStatus = response.status ?? null;
  const rawData = toObject(response.data);
  const backendStatus = typeof rawData.status === "string" ? rawData.status : null;
  const state = deriveCombinedState(responseStatus, backendStatus);

  const panechoEchoprimeResults =
    state === "ready"
      ? formatPanechoEchoprimeResultsDto(rawData.panecho_echoprime_results)
      : null;

  return {
    state,
    panechoEchoprimeResults,
  };
}

export function formatDynamicMeasurementsCombinedResultsDto(rawApiResponse) {
  const response = toObject(rawApiResponse);
  const responseStatus = response.status ?? null;
  const rawData = toObject(response.data);
  const backendStatus = typeof rawData.status === "string" ? rawData.status : null;
  const state = deriveCombinedState(responseStatus, backendStatus);

  return {
    state,
    viewerRefreshToken: buildDynamicMeasurementsViewerRefreshToken(
      rawData.dynamic_measurements_results
    ),
  };
}
