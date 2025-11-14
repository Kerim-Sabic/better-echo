import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

export default function DeleteStudyDialog({ open, study, onCancel, onConfirm, busy }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete study?</DialogTitle>
          <DialogDescription>
            This action permanently deletes the study and its related data. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {study && (
          <div className="rounded-md border border-border p-3 bg-white/50">
            <div className="text-sm"><span className="text-muted-foreground">Patient:</span> <span className="font-medium">{study?.patient?.patient_name || "Unknown"}</span></div>
            <div className="text-sm"><span className="text-muted-foreground">Study UID:</span> <span className="font-medium break-all">{study?.study_uid || "-"}</span></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

