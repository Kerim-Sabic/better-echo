import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/general_components/ui/card";
import MetadataRow from "@/features/new_study/components/MetadataRow";

function formatDicomDate(rawValue) {
  if (typeof rawValue !== "string") {
    return rawValue;
  }

  if (/^\d{8}$/.test(rawValue)) {
    const year = rawValue.slice(0, 4);
    const month = rawValue.slice(4, 6);
    const day = rawValue.slice(6, 8);
    const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));

    if (!Number.isNaN(parsedDate.getTime())) {
      try {
        return parsedDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      } catch {
        // noop
      }
    }

    return `${year}-${month}-${day}`;
  }

  return rawValue;
}

function formatDicomTime(rawValue) {
  if (typeof rawValue !== "string") {
    return rawValue;
  }

  const cleanedValue = rawValue.replace(/[^0-9]/g, "");

  if (cleanedValue.length >= 4) {
    const hours = cleanedValue.slice(0, 2);
    const minutes = cleanedValue.slice(2, 4);
    const seconds = cleanedValue.length >= 6 ? cleanedValue.slice(4, 6) : "";

    return seconds ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;
  }

  return rawValue;
}

function formatDicomSex(rawValue) {
  if (typeof rawValue !== "string") {
    return rawValue;
  }

  const normalizedValue = rawValue.trim().toUpperCase();

  if (normalizedValue === "M") return "Male";
  if (normalizedValue === "F") return "Female";
  if (normalizedValue === "O") return "Other";
  if (normalizedValue === "U") return "Unknown";

  return rawValue;
}

function formatDicomNumber(rawValue, options = {}) {
  const numericValue = Number.parseFloat(String(rawValue ?? ""));
  if (!Number.isFinite(numericValue)) {
    return rawValue;
  }

  const decimals = options.decimals ?? 2;
  return numericValue.toFixed(decimals);
}

export default function MetadataPreview({ newStudyPageViewModel }) {
  const { tags } = newStudyPageViewModel;

  if (!tags) {
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
            <MetadataRow label="Patient Name" value={tags.PatientName} />
            <MetadataRow label="Patient ID / MRN" value={tags.PatientID} />
            <MetadataRow label="Date of Birth" value={formatDicomDate(tags.PatientBirthDate)} />
            <MetadataRow label="Sex" value={formatDicomSex(tags.PatientSex)} />
            <MetadataRow label="Height (m)" value={formatDicomNumber(tags.PatientSize)} />
            <MetadataRow label="Weight (kg)" value={formatDicomNumber(tags.PatientWeight)} />
            <MetadataRow label="Heart Rate (bpm)" value={formatDicomNumber(tags.HeartRate, { decimals: 0 })} />
            <MetadataRow label="Study Date" value={formatDicomDate(tags.StudyDate)} />
            <MetadataRow label="Study Time" value={formatDicomTime(tags.StudyTime)} />
            <MetadataRow label="Accession #" value={tags.AccessionNumber} />
            <MetadataRow label="Referring Physician" value={tags.ReferringPhysicianName} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
