import React from "react";
import StudyCard from "@/features/dashboard/components/StudyCard";

export default function StudyList({ dashboardPageViewModel, editStudyModalViewModel }) {
  const { filteredStudies, onSelectStudy } = dashboardPageViewModel;
  const { openEditStudyModal, openDeleteStudyModal } = editStudyModalViewModel;

  return (
    <div className="grid gap-4">
      {filteredStudies.map(study => (
        <StudyCard
          key={study.id}
          study={study}
          onSelectStudy={onSelectStudy}
          onEdit={openEditStudyModal}
          onDelete={openDeleteStudyModal}
        />
      ))}
    </div>
  );
}
