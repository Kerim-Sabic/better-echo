import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/general_components/ui/card";
import MetadataRow from "@/features/new_study/components/MetadataRow";

export default function MetadataPreview({ newStudyPageViewModel }) {
  const { dicomTags } = newStudyPageViewModel;
  console.log("DICOM TAGS", dicomTags)

  if (!dicomTags) {
    return null;
  }

  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <CardTitle>Metadata Preview</CardTitle>
        <CardDescription>Parsed from the uploaded DICOM (read-only)</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="rounded-xl border border-border p-4 bg-white/40">
          <div className="grid gap-2">
            <MetadataRow label="Patient Name" value={dicomTags.patientName} />
            <MetadataRow label="Patient ID / MRN" value={dicomTags.patientId} />
            <MetadataRow label="Date of Birth" value={dicomTags.patientBirthDate} />
            <MetadataRow label="Sex" value={dicomTags.patientSex} />
            <MetadataRow label="Height (m)" value={dicomTags.patientSize} />
            <MetadataRow label="Weight (kg)" value={dicomTags.patientWeight} />
            <MetadataRow label="Heart Rate (bpm)" value={dicomTags.heartRate} />
            <MetadataRow label="Study Date" value={dicomTags.studyDate} />
            <MetadataRow label="Study Time" value={dicomTags.studyTime} />
            <MetadataRow label="Accession #" value={dicomTags.accessionNumber} />
            <MetadataRow label="Referring Physician" value={dicomTags.referringPhysicianName} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
