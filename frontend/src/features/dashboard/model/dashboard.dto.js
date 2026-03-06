import { formatDateTime, formatStudyDate } from "@/general_components/utility/dateUtils";

export function formatStudyList(rawStudy) {
  const rawPatient = rawStudy.patient ?? null;

  return {
    id: rawStudy.id,
    studyUid: rawStudy.study_uid,
    studyDate: rawStudy.study_date ? formatStudyDate(rawStudy.study_date) : null,
    description: rawStudy.description ?? null,
    status: rawStudy.status ?? "unknown",
    uploadedAt: formatDateTime(rawStudy.uploaded_at),
    patientHeightCm: rawStudy.patient_height_cm ?? null,
    patientWeightKg: rawStudy.patient_weight_kg ?? null,
    heartRateBpm: rawStudy.heart_rate_bpm ?? null,
    diagnoses: rawStudy.diagnoses ?? [],
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
  return rawStudiesData.map(formatStudyList);
}
