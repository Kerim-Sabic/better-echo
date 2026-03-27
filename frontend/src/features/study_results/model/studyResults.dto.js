import {
  toArray,
  toObject,
  toNullableString,
} from "@/general_components/utility/dataShapeUtils";
import { formatDateTime } from "@/general_components/utility/dateUtils";

// Maps backend/http status into the frontend page/query state used by the ViewModels.
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

// Formats the render-ready PanEcho/EchoPrime display payload used in the OHIF AI measurements tab.
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
      typeof display.totalMeasurements === "number"
        ? display.totalMeasurements
        : null,
  };
}

// Formats the complete PanEcho/EchoPrime results payload, including edit metadata for overrides.
function formatPanechoEchoprimeResultsDto(rawResults) {
  const results = toObject(rawResults);
  const overridesUpdatedAtRaw = toNullableString(results.overrides_updated_at);

  return {
    editBaselines: toObject(results.edit_baselines),
    overrides: toObject(results.overrides),
    overridesUpdatedAtRaw,
    overridesUpdatedAt: formatDateTime(overridesUpdatedAtRaw),
    display: formatPanechoEchoprimeDisplayDto(results.display),
  };
}

// Formats the display section structure for the AI report tab.
function formatLlmReportDisplayDto(rawDisplay) {
  const display = toObject(rawDisplay);

  const sections = toArray(display.sections)
    .map(section => {
      const normalizedSection = toObject(section);
      const title = toNullableString(normalizedSection.title);
      const body = toNullableString(normalizedSection.body);

      if (!title && !body) {
        return null;
      }

      return {
        title,
        body,
      };
    })
    .filter(Boolean);

  return {
    mainTitle: toNullableString(display.mainTitle),
    sections,
  };
}

// Formats the LLM report payload for the OHIF AI report tab.
function formatLlmReportDto(rawReport) {
  const report = toObject(rawReport);
  const display = formatLlmReportDisplayDto(report.display);
  const reportGeneratedAtRaw = toNullableString(report.report_generated_at);

  return {
    mainTitle: display.mainTitle,
    sections: display.sections,
    reportGeneratedAtRaw,
    reportGeneratedAt: formatDateTime(reportGeneratedAtRaw),
  };
}

// Builds a stable token from derived DICOM outputs so the OHIF viewer refreshes only when needed.
function buildDynamicMeasurementsViewerRefreshToken(
  rawDynamicMeasurementsResults
) {
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

// Used by:
// - studyResultsRepository.getPanechoEchoprimeCombinedResults(...)
// - studyResultsRepository.patchPanechoEchoprimeOverrides(...)
// Both APIs return the same PanEcho/EchoPrime combined-results response shape.
export function formatPanechoEchoprimeCombinedResultsDto(rawApiResponse) {
  const response = toObject(rawApiResponse);
  const responseStatus = response.status ?? null;
  const rawData = toObject(response.data);
  const backendStatus =
    typeof rawData.status === "string" ? rawData.status : null;
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

// Used by:
// - studyResultsRepository.getDynamicMeasurementsCombinedResults(...)
export function formatDynamicMeasurementsCombinedResultsDto(rawApiResponse) {
  const response = toObject(rawApiResponse);
  const responseStatus = response.status ?? null;
  const rawData = toObject(response.data);
  const backendStatus =
    typeof rawData.status === "string" ? rawData.status : null;
  const state = deriveCombinedState(responseStatus, backendStatus);

  return {
    state,
    viewerRefreshToken:
      state === "ready"
        ? buildDynamicMeasurementsViewerRefreshToken(
            rawData.dynamic_measurements_results
          )
        : "dynamic-measurements-not-ready",
  };
}

// Used by:
// - studyResultsRepository.getLlmReportResults(...)
export function formatLlmReportResultsDto(rawApiResponse) {
  const response = toObject(rawApiResponse);
  const responseStatus = response.status ?? null;
  const rawData = toObject(response.data);
  const backendStatus =
    typeof rawData.status === "string" ? rawData.status : null;
  const state = deriveCombinedState(responseStatus, backendStatus);

  const llmReport =
    state === "ready" ? formatLlmReportDto(rawData.llm_report) : null;

  return {
    state,
    llmReport,
    detail: state === "failed" ? toNullableString(rawData.detail) : null,
  };
}

// Note:
// - studyResultsRepository.generateLlmReport(...) does not use a DTO formatter here yet.
// - it currently returns the raw mutation response and relies on query invalidation/refetch afterward.
