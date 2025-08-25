import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadDicomApi } from "../api/UploadDicomApi";
import {
  Upload,
  FileCheck2,
  Info,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import { cn } from "../lib/utils";
import { Textarea } from "../components/ui/textarea";

// Small helper to safely read common DICOM tags from backend response
function pickTags(meta) {
  const t = meta || {};
  return {
    PatientName: t.PatientName || t["0010,0010"] || "",
    PatientID: t.PatientID || t["0010,0020"] || "",
    PatientBirthDate: t.PatientBirthDate || t["0010,0030"] || "",
    StudyDate: t.StudyDate || t["0008,0020"] || "",
    StudyTime: t.StudyTime || t["0008,0030"] || "",
    AccessionNumber: t.AccessionNumber || t["0008,0050"] || "",
    ReferringPhysicianName: t.ReferringPhysicianName || t["0008,0090"] || "",
  };
}

function upsertStudyToLocalStorage(study) {
  try {
    const raw = localStorage.getItem("studies");
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((s) => s.id === study.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...study };
    else list.unshift(study);
    localStorage.setItem("studies", JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}


function MetadataRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">
        {value || "—"}
      </span>
    </div>
  );
}

function MetadataPreview({ tags }) {
  if (!tags) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metadata preview</CardTitle>
        <CardDescription>
          Parsed from the uploaded DICOM (read-only)
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <MetadataRow label="Patient Name" value={tags.PatientName} />
        <MetadataRow label="Patient ID / MRN" value={tags.PatientID} />
        <MetadataRow label="Date of Birth" value={tags.PatientBirthDate} />
        <MetadataRow label="Study Date" value={tags.StudyDate} />
        <MetadataRow label="Study Time" value={tags.StudyTime} />
        <MetadataRow label="Accession #" value={tags.AccessionNumber} />
        <MetadataRow
          label="Referring Physician"
          value={tags.ReferringPhysicianName}
        />
      </CardContent>
    </Card>
  );
}

export default function NewStudy() {
  const navigate = useNavigate();

  // Upload + backend data
  const [file, setFile] = useState(null);
  const [isUploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [studyUID, setStudyUID] = useState(null);
  const [instanceId, setInstanceId] = useState(null);
  const [tags, setTags] = useState(null);

  // Optional manual info toggle + form
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState({
    patientName: "",
    patientId: "",
    dateOfBirth: "",
    referringPhysician: "",
    clinicalIndication: "",
    notes: "",
  });

  const prefillFromTags = (t) => {
    setForm((prev) => ({
      ...prev,
      patientName: t.PatientName || prev.patientName,
      patientId: t.PatientID || prev.patientId,
      dateOfBirth: t.PatientBirthDate || prev.dateOfBirth,
      referringPhysician: t.ReferringPhysicianName || prev.referringPhysician,
    }));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus("Uploading DICOM…");

    try {
      const data = await uploadDicomApi(file);
      const { study_uid, instance_id, tags: dicomTags } = data || {};
      if (!study_uid) {
        setStatus("Upload OK, but StudyInstanceUID missing.");
        setUploading(false);
        return;
      }
      setStudyUID(study_uid);
      setInstanceId(instance_id || null);
      const cleaned = pickTags(dicomTags || {});
      setTags(cleaned);
      prefillFromTags(cleaned);
      setStatus("Upload complete. Metadata parsed.");
    } catch (e) {
      console.error(e);
      setStatus("Upload failed.");
    } finally {
      setUploading(false);
    }
  };


  const validateManual = () => {
    if (!showManual) return true; // nothing required unless toggled on
    // Minimal checks when manual mode is enabled
    if (!form.patientName?.trim()) return false;
    if (!form.patientId?.trim()) return false;
    return true;
  };

  const createStudyAndAnalyze = async () => {
    if (!studyUID) {
      setStatus("Please upload a DICOM first.");
      return;
    }
    navigate(`/studies/${encodeURIComponent(studyUID)}`, {
      state: { study_uid: studyUID, instance_id: instanceId }
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img
                src="/lovable-uploads/9d9bcdf0-8a16-4777-8dc3-85ea7af6f600.png"
                alt="Horalix Logo"
                className="h-8 w-8"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  New Study
                </h1>
                <p className="text-sm text-muted-foreground">
                  Upload a DICOM to create a study. You can add/override patient
                  info if needed.
                </p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">{status}</div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-6 py-6 grid gap-6">
        {/* Upload card */}
        <Card>
          <CardHeader>
            <CardTitle>Upload DICOM</CardTitle>
            <CardDescription>
              Fast lane — just the file. We’ll parse tags automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              className={cn(
                "flex flex-col items-center justify-center w-full h-44 rounded-lg border border-dashed border-border bg-background cursor-pointer",
                "hover:border-primary/60 hover:bg-accent/30 transition-colors"
              )}
            >
              <input
                type="file"
                accept=".dcm,application/dicom"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-medium">
                    {file ? file.name : "Drop a DICOM here or click to browse"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    .dcm only • PHI-safe handling recommended
                  </div>
                </div>
              </div>
            </label>

            <div className="flex gap-2">
              <Button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="h-11"
              >
                {isUploading ? "Uploading…" : "Upload & Parse Tags"}
              </Button>
              {studyUID && (
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => setTags(pickTags(tags))}
                >
                  <FileCheck2 className="h-4 w-4 mr-2" />
                  Re-parse
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Metadata Preview (after upload) */}
        {studyUID && <MetadataPreview tags={tags} />}
        {studyUID && (
          <p className="text-sm text-muted-foreground">
            Tip: Click <span className="font-medium">Continue to Results</span> to view the study while EF analysis runs.
          </p>
        )}

        {/* Optional manual section */}
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
              <div className="grid md:grid-cols-2 gap-4">
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

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-4 w-4" />
                Fields above are only required if this section is enabled.
              </p>
            </CardContent>
          )}
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Cancel
          </Button>
          <Button
            className="btn-clinical"
            onClick={createStudyAndAnalyze}
            disabled={!studyUID}
          >
            Continue to Results
          </Button>
        </div>
      </main>
    </div>
  );
}
