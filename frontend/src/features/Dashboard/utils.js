import { CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "../../components/ui/badge";

/**
 * Return a status badge component for the given study status.
 */
export function getStatusBadge(status) {
    switch (status) {
        case "completed":
            return <Badge variant="success">Completed</Badge>;
        case "processing":
            return <Badge variant="secondary">Processing</Badge>;
        case "failed":
            return <Badge variant="destructive">Failed</Badge>;
        default:
            return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
}

/**
 * Return a status icon for the study status.
 */
export function getStatusIcon(status) {
    switch (status) {
        case "completed":
            return <CheckCircle className="w-5 h-5 text-green-500" />;
        case "processing":
            return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
        case "failed":
            return <AlertCircle className="w-5 h-5 text-red-500" />;
        default:
            return null;
    }
}

/**
 * Format the ejection fraction to whole numbers or one decimal place.
 */
export function formatEf(ef) {
    if (ef == null) return "-";
    return Number(ef.toFixed(1));
}
