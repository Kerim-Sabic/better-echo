export function formatUploadDicomResponseDto(rawUploadResponse) {
  const rawResponse = rawUploadResponse && typeof rawUploadResponse === "object" ? rawUploadResponse : {};

  return {
    ...rawResponse,
    study_uid: rawResponse.study_uid ?? null,
    sop_instance_uid: rawResponse.sop_instance_uid ?? null,
    tags: rawResponse.tags ?? null,
  };
}
