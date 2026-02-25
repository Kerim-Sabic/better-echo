export function formatStudyListItemDto(rawStudy) {
  const rawItem = rawStudy && typeof rawStudy === "object" ? rawStudy : {};
  const rawPatient = rawItem.patient && typeof rawItem.patient === "object" ? rawItem.patient : {};

  return {
    ...rawItem,
    id: rawItem.id ?? null,
    study_uid: rawItem.study_uid ?? null,
    status: rawItem.status ?? "unknown",
    description: rawItem.description ?? "",
    diagnoses: Array.isArray(rawItem.diagnoses) ? rawItem.diagnoses : [],
    uploaded_at: rawItem.uploaded_at ?? null,
    study_date: rawItem.study_date ?? null,
    patient: {
      ...rawPatient,
      patient_name: rawPatient.patient_name ?? "",
      patient_sex: rawPatient.patient_sex ?? null,
    },
  };
}

export function formatStudiesListDto(rawStudiesData) {
  if (!Array.isArray(rawStudiesData)) {
    return [];
  }

  return rawStudiesData.map(formatStudyListItemDto);
}
