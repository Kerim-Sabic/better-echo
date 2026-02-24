import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/features/Dashboard/layouts/DashboardLayout";
import { useDashboard } from "@/features/Dashboard/hooks/useDashboard";

export default function Dashboard() {
    const navigate = useNavigate();
    const viewModel = useDashboard();

    const onNewStudy = () => navigate("/studies/new");
    const onSelectStudy = (study) =>
        navigate(`/studies/${encodeURIComponent(study.study_uid || study.id)}`);

    return (
        <DashboardLayout 
            viewModel={viewModel}
            onNewStudy={onNewStudy}
            onSelectStudy={onSelectStudy}
        />
    );
}