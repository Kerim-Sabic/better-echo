import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateStudyMutation } from "@/features/dashboard/tanstack/mutations/useUpdateStudyMutation";
import { useDeleteStudyMutation } from "@/features/dashboard/tanstack/mutations/useDeleteStudyMutation";
import { studyResultsKeys } from "@/features/study_results/tanstack/queryKeys";

export function useEditStudyModalViewModel() {
  // 1. Data Fetching & Mutations (Server State)
  const updateStudyMutation = useUpdateStudyMutation();
  const deleteStudyMutation = useDeleteStudyMutation();
  const queryClient = useQueryClient();

  // 2. Local UI State
  const [editingStudy, setEditingStudy] = useState(null);
  const [isEditStudyModalOpen, setIsEditStudyModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ patient_name: "" });
  const [studyToDelete, setStudyToDelete] = useState(null);

  // 3. Handlers
  const openEditStudyModal = study => {
    setEditingStudy(study);
    setEditForm({
      patient_name: study?.patient?.patientName || "",
    });
    setIsEditStudyModalOpen(true);
  };

  const closeEditStudyModal = () => {
    setIsEditStudyModalOpen(false);
    setEditingStudy(null);
  };

  const saveEditStudy = async () => {
    if (!editingStudy?.id) return;

    await updateStudyMutation.mutateAsync({
      studyId: editingStudy.id,
      patchData: editForm,
    });

    closeEditStudyModal();
  };

  const openDeleteStudyModal = study => {
    setStudyToDelete(study);
  };

  const closeDeleteStudyModal = () => {
    setStudyToDelete(null);
  };

  const removeStudyResultsCache = studyUid => {
    if (!studyUid) return;

    const keysToRemove = [
      studyResultsKeys.panecho(studyUid),
      studyResultsKeys.dynamicMeasurements(studyUid),
      studyResultsKeys.llmReport(studyUid),
      studyResultsKeys.meta(studyUid),
    ];

    keysToRemove.forEach(queryKey => {
      queryClient.removeQueries({ queryKey, exact: true });
    });
  };

  const confirmDeleteStudy = async () => {
    if (!studyToDelete?.id) return;

    await deleteStudyMutation.mutateAsync({
      studyId: studyToDelete.id,
    });

    removeStudyResultsCache(studyToDelete.studyUid);
    closeDeleteStudyModal();
  };

  return {
    // Data
    editForm,
    studyToDelete,

    // Edit Modal State & Handlers
    isEditStudyModalOpen,
    setEditForm,
    openEditStudyModal,
    closeEditStudyModal,
    saveEditStudy,
    isSavingEditStudy: updateStudyMutation.isPending,

    // Delete Modal State & Handlers
    openDeleteStudyModal,
    closeDeleteStudyModal,
    confirmDeleteStudy,
    isDeletingStudy: deleteStudyMutation.isPending,
  };
}
