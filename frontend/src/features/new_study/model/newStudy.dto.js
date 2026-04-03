import {
  formatDicomTagPatientSex,
  formatDicomTagStudyDate,
  formatDicomTagStudyTime,
} from "@/general_components/utility/dicomTagsUtils";


export function formatUploadDicomResponseDto(rawApiUploadResponse) {
  const rawResponse =
    rawApiUploadResponse && typeof rawApiUploadResponse === "object" ? rawApiUploadResponse : {};

  const rawDicomTags = rawResponse.tags && typeof rawResponse.tags === "object" ? rawResponse.tags : {};
  const rawUploadResponse =
    rawResponse.upload_response && typeof rawResponse.upload_response === "object"
      ? rawResponse.upload_response
      : {};

  const studyDateRaw = rawResponse.study_date ?? rawDicomTags.StudyDate ?? rawDicomTags.study_date ?? null;
  const studyTimeRaw = rawResponse.study_time ?? rawDicomTags.StudyTime ?? rawDicomTags.study_time ?? null;

  return {
    message: rawResponse.message ?? "",
    filename: rawResponse.filename ?? "",
    patientId: rawResponse.patient_id ?? null,
    seriesUid: rawResponse.series_uid ?? null,
    sopInstanceUid: rawResponse.sop_instance_uid ?? null,
    studyUid: rawResponse.study_uid ?? null,

    studyDate: formatDicomTagStudyDate(studyDateRaw),
    studyTime: formatDicomTagStudyTime(studyTimeRaw),

    dicomTags: {
      patientName: rawDicomTags.PatientName ?? null,
      patientId: rawDicomTags.PatientID ?? null,
      patientBirthDate: rawDicomTags.PatientBirthDate ?? null,
      patientSex: formatDicomTagPatientSex(rawDicomTags.PatientSex),
      patientSize: rawDicomTags.PatientSize ?? null,
      patientWeight: rawDicomTags.PatientWeight ?? null,
      heartRate: rawDicomTags.HeartRate ?? null,
      studyDate: formatDicomTagStudyDate(rawDicomTags.StudyDate),
      studyTime: formatDicomTagStudyTime(rawDicomTags.StudyTime),
      accessionNumber: rawDicomTags.AccessionNumber ?? null,
      referringPhysicianName: rawDicomTags.ReferringPhysicianName ?? null,
      modality: rawDicomTags.Modality ?? null,
      instanceNumber: rawDicomTags.InstanceNumber ?? null,
      sopInstanceUid: rawDicomTags.SOPInstanceUID ?? null,
      seriesInstanceUid: rawDicomTags.SeriesInstanceUID ?? null,
      studyInstanceUid: rawDicomTags.StudyInstanceUID ?? null,
    },

    uploadResponse: {
      patientOrthancId: rawUploadResponse.patient_orthanc_id ?? null,
      studyOrthancId: rawUploadResponse.study_orthanc_id ?? null,
      seriesOrthancId: rawUploadResponse.series_orthanc_id ?? null,
      instanceOrthancId: rawUploadResponse.instance_orthanc_id ?? null,
    },
  };
}
