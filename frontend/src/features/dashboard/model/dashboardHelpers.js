import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

/**
 * Return a status badge component for the given study status.
 */
export function getStatusBadge(status) {
    let cls = "";
    let label = status || "Unknown";
    let icon = null;

    switch (status) {
        case "completed":
            cls = "badge-accent-soft";
            icon = <CheckCircle2 className="w-3.5 h-3.5" />;
            label = "Completed";
            break;
        case "processing":
            cls = "bg-muted text-foreground";
            icon = <Clock className="w-3.5 h-3.5 animate-glow" />;
            label = "Processing";
            break;
        case "failed":
            cls = "bg-red-50 text-red-600";
            icon = <AlertCircle className="w-3.5 h-3.5" />;
            label = "Failed";
            break;
        default:
            cls = "bg-muted text-foreground";
            break;
    }

    return (
        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${cls}`}>
            {icon}
            {label}
        </span>
    );
}

/**
 * Format the ejection fraction to whole numbers or one decimal place.
 */
export function formatEf(ef) {
    if (ef == null) return "-";
    return Number(ef.toFixed(1));
}

/**
 * Tries to parse a date from a study object (uploadedAt or studyDate).
 * Also supports legacy snake_case fields during transition.
 * Returns a Date object or null.
 */
export function parseStudyDate(study) {
    const uploadedAt = study?.uploadedAt ?? study?.uploaded_at;
    if (uploadedAt) {
        const d = new Date(uploadedAt);
        if (!isNaN(d)) return d;
    }

    const studyDate = study?.studyDate ?? study?.study_date;
    if (studyDate) {
        if (/^\d{8}$/.test(studyDate)) {
            const y = studyDate.slice(0, 4), m = studyDate.slice(4, 6), d = studyDate.slice(6, 8);
            const dt = new Date(`${y}-${m}-${d}T00:00:00`);
            if (!isNaN(dt)) return dt;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(studyDate)) {
            const dt = new Date(`${studyDate}T00:00:00`);
            if (!isNaN(dt)) return dt;
        }
    }

    return null;
}

/**
 * Formats a study's date for display (e.g., "05-12-2025")
 */
export function formatStudyDate(study) {
    const date = parseStudyDate(study);
    if (!date) return "Date unknown";
    
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${d}-${m}-${y}`;
}

/**
 * Formats a simple ISO string YYYY-MM-DD to DD-MM-YYYY
 * Used primarily in UI inputs/filters
 */
export function formatIsoToHuman(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
}

export function isSameDay(a, b) {
    return (
        a && b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}
