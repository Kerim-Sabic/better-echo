import { formatStudyDateForUi, formatUploadedAtForUi } from "./dashboardDateHelpers";

export function formatStudyData(rawStudy) {
  const rawPatient = rawStudy?.patient ?? null;

  return {
    id: rawStudy?.id ?? null,
    studyUid: rawStudy?.study_uid ?? null,

    // Keep raw values for sorting/filtering/business logic
    studyDate: rawStudy?.study_date ?? null,
    uploadedAt: rawStudy?.uploaded_at ?? null,

    // Add UI-ready display values
    studyDateLabel: formatStudyDateForUi(rawStudy?.study_date),
    uploadedAtLabel: formatUploadedAtForUi(rawStudy?.uploaded_at),

    description: rawStudy?.description ?? null,
    status: rawStudy?.status ?? "unknown",
    patientHeightCm: rawStudy?.patient_height_cm ?? null,
    patientWeightKg: rawStudy?.patient_weight_kg ?? null,
    heartRateBpm: rawStudy?.heart_rate_bpm ?? null,
    diagnoses: Array.isArray(rawStudy?.diagnoses) ? rawStudy.diagnoses : [],
    patient: rawPatient
      ? {
          id: rawPatient.id,
          patientId: rawPatient.patient_id,
          patientName: rawPatient.patient_name,
          patientSex: rawPatient.patient_sex,
          patientBirthDate: rawPatient.patient_birth_date,
        }
      : null,
  };
}

export function formatStudiesList(rawStudiesData = []) {
  if (!Array.isArray(rawStudiesData)) {
    return [];
  }

  return rawStudiesData.map(formatStudyData);
}
