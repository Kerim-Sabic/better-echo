import DashboardLayout from "@/features/dashboard/views/DashboardLayout";
import { useDashboardPageViewModel } from "@/features/dashboard/viewmodels/useDashboardPageViewModel";
import { useEditStudyModalViewModel } from "@/features/dashboard/viewmodels/useEditStudyModalViewModel";
import { useDashboardHeaderViewModel } from "@/features/dashboard/viewmodels/useDashboardHeaderViewModel";

export default function DashboardPage() {
  const dashboardPageViewModel = useDashboardPageViewModel();
  const editStudyModalViewModel = useEditStudyModalViewModel();
  const dashboardHeaderViewModel = useDashboardHeaderViewModel();

  return (
    <DashboardLayout
      dashboardPageViewModel={dashboardPageViewModel}
      editStudyModalViewModel={editStudyModalViewModel}
      dashboardHeaderViewModel={dashboardHeaderViewModel}
    />
  );
}
