import {
  toArray,
  toObject,
  toNullableString,
} from "@/general_components/utility/dataShapeUtils";
import { formatDateTime } from "@/general_components/utility/dateUtils";
import { formatDicomTagStudyDate } from "@/general_components/utility/dicomTagsUtils";
import { buildDerivedMediaViewerRefreshToken } from "./studyResults.constants";

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

// Formats the render-ready study-analysis display payload used in the OHIF AI measurements tab.
function formatStudyAnalysisDisplayDto(rawDisplay) {
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

// Formats the complete study-analysis results payload, including edit metadata for overrides.
function formatStudyAnalysisResultsDto(rawResults) {
  const results = toObject(rawResults);
  const overridesUpdatedAtRaw = toNullableString(results.overrides_updated_at);

  return {
    editBaselines: toObject(results.edit_baselines),
    overrides: toObject(results.overrides),
    overridesUpdatedAtRaw,
    overridesUpdatedAt: formatDateTime(overridesUpdatedAtRaw),
    display: formatStudyAnalysisDisplayDto(results.display),
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
      .map(result => {
        const normalizedResult = toObject(result);
        const derivedDicom = toObject(normalizedResult.derived_dicom);
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

  return buildDerivedMediaViewerRefreshToken(tokens);
}

// Used by:
// - studyResultsRepository.getStudyAnalysisCombinedResults(...)
// - studyResultsRepository.patchStudyAnalysisOverrides(...)
// Both APIs return the same study-analysis combined-results response shape.
export function formatStudyAnalysisCombinedResultsDto(rawApiResponse) {
  const response = toObject(rawApiResponse);
  const responseStatus = response.status ?? null;
  const rawData = toObject(response.data);
  const backendStatus =
    typeof rawData.status === "string" ? rawData.status : null;
  const state = deriveCombinedState(responseStatus, backendStatus);

  const studyAnalysisResults =
    state === "ready"
      ? formatStudyAnalysisResultsDto(rawData.analysis_results)
      : null;

  return {
    state,
    studyAnalysisCombinedResults: studyAnalysisResults,
    detail: state === "failed" ? toNullableString(rawData.detail) : null,
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
    viewerRefreshToken: buildDynamicMeasurementsViewerRefreshToken(
      rawData.measurement_results
    ),
    detail: state === "failed" ? toNullableString(rawData.detail) : null,
  };
}

// Used by:
// - studyResultsRepository.getStudyDetails(...)
// Formats the single-study metadata payload used by the Study Results page.
export function formatStudyDetailsDto(rawStudy) {
  const study = toObject(rawStudy);
  const patient = toObject(study.patient);

  return {
    id: study.id ?? null,
    studyUid: toNullableString(study.study_uid),
    studyDate: toNullableString(study.study_date),
    studyTime: toNullableString(study.study_time),
    uploadedAt: study.uploaded_at ?? null,
    studyDateLabel: formatDicomTagStudyDate(study.study_date),
    uploadedAtLabel: formatDateTime(study.uploaded_at),
    description: toNullableString(study.description),
    status: toNullableString(study.status) || "unknown",
    patientHeightCm:
      typeof study.patient_height_cm === "number" ? study.patient_height_cm : null,
    patientWeightKg:
      typeof study.patient_weight_kg === "number" ? study.patient_weight_kg : null,
    heartRateBpm:
      typeof study.heart_rate_bpm === "number" ? study.heart_rate_bpm : null,
    accessionNumber: toNullableString(study.accession_number),
    referringPhysicianName: toNullableString(study.referring_physician_name),
    sonographerName: toNullableString(study.sonographer_name),
    indication: toNullableString(study.indication),
    machineName: toNullableString(study.machine_name),
    modality: toNullableString(study.modality),
    llmEnabled: Boolean(study.llm_enabled),
    diagnoses: toArray(study.diagnoses),
    patient:
      Object.keys(patient).length > 0
        ? {
            id: patient.id ?? null,
            patientId: toNullableString(patient.patient_id),
            patientName: toNullableString(patient.patient_name),
            patientSex: toNullableString(patient.patient_sex),
            patientBirthDate: toNullableString(patient.patient_birth_date),
          }
        : null,
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
