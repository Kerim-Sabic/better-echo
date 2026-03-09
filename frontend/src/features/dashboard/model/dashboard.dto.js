export function formatStudyList(rawStudy) {
  const rawPatient = rawStudy?.patient ?? null;

  return {
    id: rawStudy?.id ?? null,
    studyUid: rawStudy?.study_uid ?? null,
    studyDate: rawStudy?.study_date ?? null,
    description: rawStudy?.description ?? null,
    status: rawStudy?.status ?? "unknown",
    uploadedAt: rawStudy?.uploaded_at ?? null,
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

  return rawStudiesData.map(formatStudyList);
}
