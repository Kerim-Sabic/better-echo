import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/features/dashboard/views/DashboardLayout";
import { useDashboardPageViewModel } from "@/features/dashboard/viewmodels/useDashboardPageViewModel";

export default function DashboardPage() {
  const navigate = useNavigate();
  const dashboardPageViewModel = useDashboardPageViewModel();

  const handleNewStudy = () => navigate("/studies/new");
  const handleSelectStudy = study =>
    navigate(`/studies/${encodeURIComponent(study.study_uid || study.id)}`);

  return (
    <DashboardLayout
      viewModel={dashboardPageViewModel}
      onNewStudy={handleNewStudy}
      onSelectStudy={handleSelectStudy}
    />
  );
}
