import React from "react";
import { FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export default function DashboardStats({ dashboardPageViewModel }) {
  const { studyStatusCounts = {} } = dashboardPageViewModel;

  const statItems = [
    { label: "Total Studies", value: studyStatusCounts?.all ?? 0, Icon: FileText },
    { label: "Completed", value: studyStatusCounts?.completed ?? 0, Icon: CheckCircle2 },
    { label: "Processing", value: studyStatusCounts?.processing ?? 0, Icon: Clock },
    { label: "Failed", value: studyStatusCounts?.failed ?? 0, Icon: AlertCircle },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 md:grid-cols-4">
      {statItems.map(({ label, value, Icon }) => (
        <div
          key={label}
          className="glass-card rounded-2xl p-6 flex flex-col items-center justify-between text-center h-40"
        >
          <div className="w-12 h-12 rounded-xl icon-chip-accent flex items-center justify-center mb-2">
            <Icon className="w-6 h-6" />
          </div>
          <div className="text-4xl font-semibold leading-none">{value}</div>
          <div className="text-sm text-muted-foreground mt-1">{label}</div>
        </div>
      ))}
    </section>
  );
}
