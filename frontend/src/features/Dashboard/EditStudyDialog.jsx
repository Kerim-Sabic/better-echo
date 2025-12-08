import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export default function EditStudyDialog({
    open,
    setOpen,
    editForm,
    setEditForm,
    onSave,
    saving,
}) {
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit study</DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                    <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">Patient Name</div>
                        <Input
                            value={editForm.patient_name}
                            onChange={(e) =>
                                setEditForm((f) => ({ ...f, patient_name: e.target.value }))
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onSave();
                            }}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={onSave} disabled={saving}>
                            {saving ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
