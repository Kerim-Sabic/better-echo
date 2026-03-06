import { getStudiesApi, patchStudyApi, deleteStudyApi } from "@/api/studies";
import { formatStudiesList, formatStudyList } from "./dashboard.dto";

export const dashboardRepository = {
  async getStudies() {
    const rawStudiesData = await getStudiesApi();
    const formattedStudiesData = formatStudiesList(rawStudiesData);
    return formattedStudiesData;
  },

  async updateStudy(studyId, patchData) {
    const rawStudyData = await patchStudyApi(studyId, patchData);
    const formattedStudyData = formatStudyList(rawStudyData);
    return formattedStudyData;
  },

  async deleteStudy(studyId) {
    return deleteStudyApi(studyId);
  },
};
