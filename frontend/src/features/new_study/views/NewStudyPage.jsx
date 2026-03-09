import NewStudyLayout from "@/features/new_study/views/NewStudyLayout";
import { useNewStudyPageViewModel } from "@/features/new_study/viewmodels/useNewStudyPageViewModel";

export default function NewStudyPage() {
  const newStudyPageViewModel = useNewStudyPageViewModel();

  return <NewStudyLayout viewModel={newStudyPageViewModel} />;
}
