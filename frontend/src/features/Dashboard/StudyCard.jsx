import { User, Edit, Trash2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { formatEf } from "./utils";

export default function StudyCard({ study, onSelectStudy, onEdit, onDelete }) {
    return (
        <Card
            className="w-full max-w-full cursor-pointer glass-card p-5 hover:shadow-xl hover:-translate-y-1 smooth-transition group"
            onClick={() => onSelectStudy(study)}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 flex-1 overflow-hidden">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-[#9333EA] via-[#6366F1] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-white" />
                    </div>

                    {/* Study info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-foreground truncate">
                                {study?.patient?.patient_id || study?.patient?.patient_name || "Unknown"}
                            </h3>
                            <StatusPill status={study?.status} />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1 truncate">
                            {study?.patient?.patient_name || "Unknown patient"}
                        </p>
                        <p className="text-sm text-muted-foreground truncate" title={study?.study_uid || ""}>
                            Study UID: {study?.study_uid || "-"} {"\u00B7 "}
                            {formatUploadedDate(study)}
                        </p>
                    </div>
                </div>

                {/* Actions shown on hover */}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 fast-transition">
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Edit study"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit(study);
                        }}
                        className="hover:bg-primary/10 hover:text-primary"
                    >
                        <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Delete study"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(study);
                        }}
                        className="hover:bg-destructive/10 hover:text-destructive"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Optional EF display if present */}
            {typeof study?.ef === "number" && (
                <div className="mt-4 text-sm text-muted-foreground">
                    <span className="mr-2">Ejection Fraction:</span>
                    <span className="text-primary font-semibold">{formatEf(study.ef)}%</span>
                </div>
            )}
        </Card>
    );
}

function StatusPill({ status }) {
    let cls = "";
    let label = status || "Unknown";
    let icon = null;
    if (status === "completed") {
        cls = "bg-[#06B6D4]/10 text-[#06B6D4]";
        icon = <CheckCircle2 className="w-3.5 h-3.5" />;
        label = "Completed";
    } else if (status === "processing") {
        cls = "bg-[#9333EA]/10 text-[#9333EA]";
        icon = <Clock className="w-3.5 h-3.5 animate-glow" />;
        label = "Processing";
    } else if (status === "failed") {
        cls = "bg-red-50 text-red-600";
        icon = <AlertCircle className="w-3.5 h-3.5" />;
        label = "Failed";
    } else {
        cls = "bg-muted text-foreground";
    }
    return (
        <span className={["px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5", cls].join(" ")}>
            {icon}
            {label}
        </span>
    );
}

function formatUploadedDate(study) {
    if (study?.uploaded_at) {
        const d = new Date(study.uploaded_at);
        if (!isNaN(d)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        }
    }
    const sd = study?.study_date;
    if (sd && /^\d{8}$/.test(sd)) {
        return `${sd.slice(0, 4)}-${sd.slice(4, 6)}-${sd.slice(6, 8)}`;
    }
    return "Date unknown";
}
