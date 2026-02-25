import { uploadDicomApi } from "@/api/upload_dicom/uploadDicomApi";
import { formatUploadDicomResponseDto } from "./newStudy.dto";

export const newStudyRepository = {
  async uploadDicom(file) {
    const rawUploadResponse = await uploadDicomApi(file);
    const formattedUploadResponse = formatUploadDicomResponseDto(rawUploadResponse);
    return formattedUploadResponse;
  },
};
