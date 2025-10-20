import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StudyResultsLayout } from "../features/StudyResults/layouts/StudyResultsLayout"
import { useStudyResults } from "../features/StudyResults/hooks/useStudyResults";

export default function StudyResultsPage() {
  const { studyUid } = useParams();
  const navigate = useNavigate();

  const viewModel = useStudyResults(studyUid)
  console.log("VIEW MODEL: ", viewModel)

  return (
    <StudyResultsLayout
      navigateBack={() => navigate("/dashboard")}
      viewModel={viewModel}
    />
  );
}