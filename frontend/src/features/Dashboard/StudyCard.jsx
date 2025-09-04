import { User, Calendar } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getStatusBadge, getStatusIcon, formatEf } from "./utils";

export default function StudyCard({ study, onSelectStudy, onEdit, onDelete }) {
  return (
    <Card
      className="card-clinical cursor-pointer hover:scale-[1.01] transition-transform"
      onClick={() => onSelectStudy(study)}
    >
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-4 min-h-[160px]">
          {/* LEFT */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">
                {study.patient.patient_name || "Unknown patient"}
              </h3>
              <p
                className="text-sm truncate text-muted-foreground"
                title={study.study_uid || "—"}
              >
                Study UID: {study.study_uid || "—"}
              </p>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  {study.study_date
                    ? `${study.study_date.slice(0, 4)}-${study.study_date.slice(
                        4,
                        6
                      )}-${study.study_date.slice(6, 8)}`
                    : "Date unknown"}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col items-end justify-between">
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center justify-end space-x-2">
                {getStatusIcon(study.status)}
                {getStatusBadge(study.status, study.ef)}
              </div>

              {typeof study.ef === "number" && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Ejection Fraction</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatEf(study.ef)}%
                  </p>
                </div>
              )}

              {study.status === "processing" && (
                <p className="max-w-xs text-sm text-muted-foreground">
                  Analysis is running…
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(study);
                }}
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(study);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
