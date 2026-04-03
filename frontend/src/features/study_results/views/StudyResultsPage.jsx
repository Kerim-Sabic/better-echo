import { useParams } from "react-router-dom";
import StudyResultsLayout from "@/features/study_results/views/StudyResultsLayout";
import { useStudyResultsViewModel } from "@/features/study_results/viewmodels/useStudyResultsViewModel";

export default function StudyResultsPage() {
  const { studyUid } = useParams();
  const studyResultsPageViewModel = useStudyResultsViewModel(studyUid);

  return <StudyResultsLayout studyResultsPageViewModel={studyResultsPageViewModel} />;
}
