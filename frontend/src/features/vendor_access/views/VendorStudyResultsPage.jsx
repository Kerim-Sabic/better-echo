import { useParams } from "react-router-dom";

import StudyResultsLayout from "@/features/study_results/views/StudyResultsLayout";
import { useStudyResultsViewModel } from "@/features/study_results/viewmodels/useStudyResultsViewModel";

export default function VendorStudyResultsPage() {
  const { studyUid } = useParams();
  const studyResultsPageViewModel = useStudyResultsViewModel(studyUid, {
    accessMode: "vendor",
  });

  return <StudyResultsLayout studyResultsPageViewModel={studyResultsPageViewModel} />;
}
