import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/general_components/ui/dialog";
import { Button } from "@/general_components/ui/button";
import { Input } from "@/general_components/ui/input";

export default function EditStudyDialog({ editStudyModalViewModel }) {
  const {
    isEditStudyModalOpen,
    editForm,
    setEditForm,
    closeEditStudyModal,
    saveEditStudy,
    isSavingEditStudy,
  } = editStudyModalViewModel;

  return (
    <Dialog
      open={isEditStudyModalOpen}
      onOpenChange={isOpen => {
        if (!isOpen) closeEditStudyModal();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit study</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Patient Name</div>
            <Input
              value={editForm?.patient_name || ""}
              onChange={event =>
                setEditForm(currentForm => ({
                  ...currentForm,
                  patient_name: event.target.value,
                }))
              }
              onKeyDown={event => {
                if (event.key === "Enter") saveEditStudy();
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeEditStudyModal}>
              Cancel
            </Button>
            <Button onClick={saveEditStudy} disabled={isSavingEditStudy}>
              {isSavingEditStudy ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
