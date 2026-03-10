import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StudyResultsLayout from "@/features/study_results/views/StudyResultsLayout";
import { useStudyResultsViewModel } from "@/features/study_results/viewmodels/useStudyResultsViewModel";

function toBooleanFlag(value, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return normalizedValue === "1" || normalizedValue === "true" || normalizedValue === "yes";
}

export default function StudyResultsPage() {
  const { studyUid } = useParams();
  const navigate = useNavigate();

  const baseViewModel = useStudyResultsViewModel(studyUid);

  const studyResultsViewModel = useMemo(
    () => ({
      ...baseViewModel,
      studyUID: studyUid ?? null,
    }),
    [baseViewModel, studyUid]
  );

  const useOhifAiPanel = toBooleanFlag(process.env.REACT_APP_ENABLE_OHIF_AI_PANEL, true);

  // Temporary payload while migrating serializer.
  const ohifAiPayload = useMemo(
    () => ({
      version: 1,
      sentAt: new Date().toISOString(),
      studyUID: studyUid ?? null,
      state: studyResultsViewModel?.state ?? "loading",
      panEchoEchoprimeState: studyResultsViewModel?.panEchoEchoprimeState ?? "loading",
      panechoEchoprimeResults: studyResultsViewModel?.panechoEchoprimeResults ?? null,
      combinedData: studyResultsViewModel?.combinedData ?? null,
    }),
    [studyUid, studyResultsViewModel]
  );

  return (
    <StudyResultsLayout
      navigateBack={() => navigate("/dashboard")}
      studyResultsViewModel={studyResultsViewModel}
      useOhifAiPanel={useOhifAiPanel}
      ohifAiPayload={ohifAiPayload}
    />
  );
}
