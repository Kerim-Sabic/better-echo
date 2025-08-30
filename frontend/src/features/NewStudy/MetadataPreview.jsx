import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import MetadataRow from "./MetadataRow";

export default function MetadataPreview({ tags }) {
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
