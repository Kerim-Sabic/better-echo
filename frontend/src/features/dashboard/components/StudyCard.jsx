import React from "react";
import { User, Edit, Trash2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Card } from "@/general_components/ui/card";
import { Button } from "@/general_components/ui/button";

function StatusBadge({ status }) {
  const normalizedStatus = String(status || "").toLowerCase();

  const statusConfigByKey = {
    completed: {
      className: "badge-accent-soft",
      label: "Completed",
      Icon: CheckCircle2,
    },
    processing: {
      className: "bg-muted text-foreground",
      label: "Processing",
      Icon: Clock,
    },
    failed: {
      className: "bg-red-50 text-red-600",
      label: "Failed",
      Icon: AlertCircle,
    },
  };

  const statusConfig = statusConfigByKey[normalizedStatus] || {
    className: "bg-muted text-foreground",
    label: status || "Unknown",
    Icon: null,
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${statusConfig.className}`}
    >
      {statusConfig.Icon ? <statusConfig.Icon className="w-3.5 h-3.5" /> : null}
      {statusConfig.label}
    </span>
  );
}

export default function StudyCard({ study, onSelectStudy, onEdit, onDelete }) {
  return (
    <Card
      className="w-full max-w-full cursor-pointer glass-card p-5 hover:shadow-xl hover:-translate-y-1 smooth-transition group"
      onClick={() => onSelectStudy(study)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 flex-1 overflow-hidden">
          <div className="w-12 h-12 rounded-xl icon-chip-accent flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-bold text-foreground truncate">
                {study?.patient?.patientName || study?.patient?.patientId || "Unknown"}
              </h3>
              <StatusBadge status={study?.status} />
            </div>

            <p className="text-sm font-medium text-foreground mb-1 truncate">
              Study UID: {study?.studyUid || "-"}
            </p>

            <p className="text-sm text-muted-foreground truncate" title={study?.studyDateLabel || "-"}>
              {study?.studyDateLabel || "-"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 fast-transition">
          <Button
            variant="outline"
            size="icon"
            aria-label="Edit study"
            onClick={event => {
              event.stopPropagation();
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
            onClick={event => {
              event.stopPropagation();
              onDelete(study);
            }}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
