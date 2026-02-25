import { uploadDicomApi } from "@/api/UploadDicomApi";
import { formatUploadDicomResponseDto } from "./newStudy.dto";

export const newStudyRepository = {
  async uploadDicom(file) {
    const rawUploadResponse = await uploadDicomApi(file);
    const formattedUploadResponse = formatUploadDicomResponseDto(rawUploadResponse);
    return formattedUploadResponse;
  },
};
