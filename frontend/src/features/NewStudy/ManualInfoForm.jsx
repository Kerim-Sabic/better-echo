import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";

export default function ManualInfoForm({ showManual, setShowManual, form, setForm }) {
  return (
    <Card>
      <CardHeader
        className="flex flex-row items-center justify-between cursor-pointer select-none"
        onClick={() => setShowManual((s) => !s)}
      >
        <div>
          <CardTitle>Add / override patient info</CardTitle>
          <CardDescription>
            Optional — only required if you enable this section.
          </CardDescription>
        </div>
        <div className="text-muted-foreground">
          {showManual ? <ChevronDown /> : <ChevronRight />}
        </div>
      </CardHeader>

      {showManual && (
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="patientName">Patient Name</Label>
              <Input
                id="patientName"
                value={form.patientName}
                onChange={(e) =>
                  setForm({ ...form, patientName: e.target.value })
                }
                placeholder="e.g., DOE^JOHN"
                required={showManual}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patientId">Patient ID / MRN</Label>
              <Input
                id="patientId"
                value={form.patientId}
                onChange={(e) =>
                  setForm({ ...form, patientId: e.target.value })
                }
                placeholder="e.g., MRN-123456"
                required={showManual}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) =>
                  setForm({ ...form, dateOfBirth: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="referringPhysician">
                Referring Physician
              </Label>
              <Input
                id="referringPhysician"
                value={form.referringPhysician}
                onChange={(e) =>
                  setForm({ ...form, referringPhysician: e.target.value })
                }
                placeholder="e.g., Smith, A."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinicalIndication">Clinical indication</Label>
            <Textarea
              id="clinicalIndication"
              placeholder="e.g., Chest pain, r/o heart failure"
              value={form.clinicalIndication}
              onChange={(e) =>
                setForm({ ...form, clinicalIndication: e.target.value })
              }
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal notes (not sent to PACS)</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>

          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="w-4 h-4" />
            Fields above are only required if this section is enabled.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
