import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/general_components/ui/dialog";
import { Button } from "@/general_components/ui/button";

export default function DeleteStudyDialog({ editStudyModalViewModel }) {
  const {
    studyToDelete,
    isDeletingStudy,
    closeDeleteStudyModal,
    confirmDeleteStudy,
  } = editStudyModalViewModel;

  return (
    <Dialog
      open={Boolean(studyToDelete)}
      onOpenChange={isOpen => {
        if (!isOpen) closeDeleteStudyModal();
      }}
    >
      <DialogContent className="w-[min(640px,calc(100vw-2rem))] sm:max-w-xl space-y-4">
        <DialogHeader>
          <DialogTitle>Delete study?</DialogTitle>
          <DialogDescription>
            This action permanently deletes the study and related data. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {studyToDelete && (
          <div className="rounded-md border border-border p-3 bg-white/50 space-y-1 w-full overflow-hidden">
            <div className="text-sm">
              <span className="text-muted-foreground">Patient:</span>{" "}
              <span className="font-medium break-words break-all">
                {studyToDelete?.patient?.patientName || "Unknown"}
              </span>
            </div>

            <div className="text-sm">
              <span className="text-muted-foreground">Study UID:</span>{" "}
              <span className="font-medium break-all whitespace-normal">
                {studyToDelete?.studyUid || "-"}
              </span>
            </div>

            <div className="text-sm">
              <span className="text-muted-foreground">Date:</span>{" "}
              <span className="font-medium break-all whitespace-normal">
                {studyToDelete?.studyDateLabel || "-"}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 w-full sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={closeDeleteStudyModal} disabled={isDeletingStudy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDeleteStudy} disabled={isDeletingStudy}>
            {isDeletingStudy ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
