import { listStudiesApi, patchStudyApi, deleteStudyApi } from "@/api/studies";
import { formatStudiesListDto, formatStudyListItemDto } from "./dashboard.dto";

export const dashboardRepository = {
  async getStudies() {
    const rawStudiesData = await listStudiesApi();
    const formattedStudiesData = formatStudiesListDto(rawStudiesData);
    return formattedStudiesData;
  },

  async updateStudy(studyId, patchData) {
    const rawStudyData = await patchStudyApi(studyId, patchData);
    const formattedStudyData = formatStudyListItemDto(rawStudyData);
    return formattedStudyData;
  },

  async deleteStudy(studyId) {
    return deleteStudyApi(studyId);
  },
};
