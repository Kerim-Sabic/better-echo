import { User, Edit, Trash2 } from "lucide-react";
import { Card } from "../../../../general_components/ui/card";
import { Button } from "../../../../general_components/ui/button";
import { formatEf, formatStudyDate, getStatusBadge } from "../../model/dashboardHelpers";

export default function StudyCard({ study, onSelectStudy, onEdit, onDelete }) {
    return (
        <Card
            className="w-full max-w-full cursor-pointer glass-card p-5 hover:shadow-xl hover:-translate-y-1 smooth-transition group"
            onClick={() => onSelectStudy(study)}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 flex-1 overflow-hidden">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-xl icon-chip-accent flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6" />
                    </div>

                    {/* Study info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-foreground truncate">
                                {study?.patient?.patientName || study?.patient?.patientId || "Unknown"}
                            </h3>
                            {getStatusBadge(study?.status)}
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1 truncate">
                            Study UID: {study?.studyUid || "-"}
                        </p>
                        <p className="text-sm text-muted-foreground truncate" title={formatStudyDate(study)}>
                            {formatStudyDate(study)}
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
