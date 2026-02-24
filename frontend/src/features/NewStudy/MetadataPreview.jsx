import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../general_components/ui/card";
import MetadataRow from "./MetadataRow";

function formatDicomDate(s) {
    if (typeof s !== "string") return s;
    // YYYYMMDD
    if (/^\d{8}$/.test(s)) {
        const y = s.slice(0, 4);
        const m = s.slice(4, 6);
        const d = s.slice(6, 8);
        const date = new Date(Number(y), Number(m) - 1, Number(d));
        if (!isNaN(date)) {
            try {
                return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
            } catch {}
        }
        return `${y}-${m}-${d}`; // safe fallback
    }
    return s;
}

function formatDicomTime(s) {
    if (typeof s !== "string") return s;
    // HHMMSS(.fff) or HHMM
    const cleaned = s.replace(/[^0-9]/g, "");
    if (cleaned.length >= 4) {
        const hh = cleaned.slice(0, 2);
        const mm = cleaned.slice(2, 4);
        const ss = cleaned.length >= 6 ? cleaned.slice(4, 6) : "";
        return ss ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
    }
    return s;
}

function formatDicomSex(s) {
    if (typeof s !== "string") return s;
    const cleaned = s.trim().toUpperCase();
    if (cleaned === "M") return "Male";
    if (cleaned === "F") return "Female";
    if (cleaned === "O") return "Other";
    if (cleaned === "U") return "Unknown";
    return s;
}

function formatDicomNumber(s, options = {}) {
    const value = Number.parseFloat(String(s ?? ""));
    if (!Number.isFinite(value)) return s;
    const decimals = options.decimals ?? 2;
    return value.toFixed(decimals);
}

export default function MetadataPreview({ tags }) {
    if (!tags) return null;
    return (
        <Card className="glass-card border-0">
            <CardHeader>
                <CardTitle>Metadata Preview</CardTitle>
                <CardDescription>
                    Parsed from the uploaded DICOM (read-only)
                </CardDescription>
            </CardHeader>
            <CardContent>
                {/* Inner boxed content */}
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
