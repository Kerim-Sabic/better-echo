import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StudyResultsLayout from "@/features/study_results/views/StudyResultsLayout";
import { useStudyResultsPageViewModel } from "@/features/study_results/viewmodels/useStudyResultsPageViewModel";
import { buildStudyResultsOhifAiPayload } from "@/features/study_results/viewmodels/ohifAiPayloadSerializer";

function toBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return normalizedValue === "1" || normalizedValue === "true" || normalizedValue === "yes";
}

export default function StudyResultsPage() {
  const { studyUid } = useParams();
  const navigate = useNavigate();

  const studyResultsPageViewModel = useStudyResultsPageViewModel(studyUid);
  const useOhifAiPanel = toBooleanFlag(process.env.REACT_APP_ENABLE_OHIF_AI_PANEL, false);

  const ohifAiPayload = useMemo(
    () => buildStudyResultsOhifAiPayload(studyResultsPageViewModel),
    [studyResultsPageViewModel]
  );

  return (
    <StudyResultsLayout
      navigateBack={() => navigate("/dashboard")}
      viewModel={studyResultsPageViewModel}
      useOhifAiPanel={useOhifAiPanel}
      ohifAiPayload={ohifAiPayload}
    />
  );
}
