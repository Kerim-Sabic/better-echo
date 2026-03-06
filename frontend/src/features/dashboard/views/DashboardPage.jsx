import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/features/dashboard/views/DashboardLayout";
import { useDashboardPageViewModel } from "@/features/dashboard/viewmodels/useDashboardPageViewModel";
import { useEditStudyModalViewModel } from "@/features/dashboard/viewmodels/useEditStudyModalViewModel";

export default function DashboardPage() {
  const navigate = useNavigate();
  const dashboardPageViewModel = useDashboardPageViewModel();
  const editStudyModalViewModel = useEditStudyModalViewModel();

  const handleNewStudy = () => navigate("/studies/new");
  const handleSelectStudy = study =>
    navigate(`/studies/${encodeURIComponent(study.studyUid || study.id)}`);

  return (
    <DashboardLayout
      dashboardPageViewModel={dashboardPageViewModel}
      editStudyModalViewModel={editStudyModalViewModel}
      onNewStudy={handleNewStudy}
      onSelectStudy={handleSelectStudy}
    />
  );
}
