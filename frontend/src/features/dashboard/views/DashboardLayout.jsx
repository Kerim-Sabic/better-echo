import React from "react";
import {
  DashboardHeader,
  SearchAndFilters,
  DashboardStats,
  StudyList,
  EditStudyDialog,
  DeleteStudyDialog,
  LoadingStudies,
  NoStudiesFound,
} from "@/features/dashboard/components";
import { TITLEBAR_HEIGHT } from "@/general_components/TitleBar";

export default function DashboardLayout({
  dashboardPageViewModel,
  editStudyModalViewModel,
  dashboardHeaderViewModel,
}) {
  return (
    <div className="bg-[#f8f8f8]" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}>
      <DashboardHeader
        dashboardHeaderViewModel={dashboardHeaderViewModel}
        onNewStudy={dashboardPageViewModel.onNewStudy}
      />

      <main className="container px-6 py-6 mx-auto">
        {dashboardPageViewModel.isStudiesLoading && <LoadingStudies />}

        {!dashboardPageViewModel.isStudiesLoading && (
          <>
            <DashboardStats dashboardPageViewModel={dashboardPageViewModel} />
            <SearchAndFilters dashboardPageViewModel={dashboardPageViewModel} />
            <StudyList
              dashboardPageViewModel={dashboardPageViewModel}
              editStudyModalViewModel={editStudyModalViewModel}
            />
            <EditStudyDialog editStudyModalViewModel={editStudyModalViewModel} />
            <DeleteStudyDialog editStudyModalViewModel={editStudyModalViewModel} />

            {dashboardPageViewModel.filteredStudies.length === 0 && (
              <NoStudiesFound studySearchInputQuery={dashboardPageViewModel.studySearchInputQuery} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
