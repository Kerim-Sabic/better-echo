import { useState } from "react";
import { useUpdateStudyMutation } from "@/features/dashboard/tanstack/mutations/useUpdateStudyMutation";
import { useDeleteStudyMutation } from "@/features/dashboard/tanstack/mutations/useDeleteStudyMutation";

export function useEditStudyModalViewModel() {
  // 1. Data Fetching & Mutations (Server State)
  const updateStudyMutation = useUpdateStudyMutation();
  const deleteStudyMutation = useDeleteStudyMutation();

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

  const confirmDeleteStudy = async () => {
    if (!studyToDelete?.id) return;

    await deleteStudyMutation.mutateAsync({
      studyId: studyToDelete.id,
      studyUid: studyToDelete.studyUid,
    });

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
