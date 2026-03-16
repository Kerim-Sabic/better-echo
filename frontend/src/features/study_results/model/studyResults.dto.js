import { toArray, toObject } from "@/general_components/utility/dataShapeUtils";

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

export function formatPanechoEchoprimeCombinedResultsDto(rawApiResponse) {
  const response = toObject(rawApiResponse);
  const responseStatus = response.status ?? null;
  const rawData = toObject(response.data);
  const backendStatus = typeof rawData.status === "string" ? rawData.status : null;

  let state = "error";

  if (responseStatus === 202 || backendStatus === "pending") {
    state = "pending";
  } else if (responseStatus === 404) {
    state = "not_found";
  } else if (backendStatus === "complete") {
    state = "ready";
  } else if (backendStatus === "failed") {
    state = "failed";
  }

  const panechoEchoprimeResults =
    state === "ready"
      ? formatPanechoEchoprimeResultsDto(rawData.panecho_echoprime_results)
      : null;

  return {
    state,
    panechoEchoprimeResults,
  };
}
