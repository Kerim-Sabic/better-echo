import { getStudiesApi, patchStudyApi, deleteStudyApi } from "@/api/studies";
import { formatStudiesList } from "./dashboard.dto";

export const dashboardRepository = {
  async getStudies() {
    const rawStudiesData = await getStudiesApi();
    return formatStudiesList(rawStudiesData);
  },

  async updateStudy(studyId, patchData) {
    return patchStudyApi(studyId, patchData);
  },

  async deleteStudy(studyId) {
    return deleteStudyApi(studyId);
  },
};
