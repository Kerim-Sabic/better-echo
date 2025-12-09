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
            cls = "bg-[#06B6D4]/10 text-[#06B6D4]";
            icon = <CheckCircle2 className="w-3.5 h-3.5" />;
            label = "Completed";
            break;
        case "processing":
            cls = "bg-[#9333EA]/10 text-[#9333EA]";
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
 * Tries to parse a date from a study object (uploaded_at or study_date)
 * Returns a Date object or null.
 */
export function parseStudyDate(study) {
    // 1. Try uploaded_at (ISO string)
    if (study?.uploaded_at) {
        const d = new Date(study.uploaded_at);
        if (!isNaN(d)) return d;
    }
    // 2. Try study_date (YYYYMMDD or YYYY-MM-DD)
    const sd = study?.study_date;
    if (sd) {
        // Handle YYYYMMDD
        if (/^\d{8}$/.test(sd)) {
            const y = sd.slice(0, 4), m = sd.slice(4, 6), d = sd.slice(6, 8);
            const dt = new Date(`${y}-${m}-${d}T00:00:00`);
            if (!isNaN(dt)) return dt;
        }
        // Handle YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) {
            const dt = new Date(`${sd}T00:00:00`);
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