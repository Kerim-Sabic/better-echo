import { FileText, CheckCircle2, Clock } from "lucide-react";

function parseStudyDate(study) {
  if (study?.uploaded_at) {
    const d = new Date(study.uploaded_at);
    if (!isNaN(d)) return d;
  }
  const sd = study?.study_date;
  if (sd && /^\d{8}$/.test(sd)) {
    const y = sd.slice(0, 4), m = sd.slice(4, 6), d = sd.slice(6, 8);
    const dt = new Date(`${y}-${m}-${d}T00:00:00`);
    if (!isNaN(dt)) return dt;
  }
  return null;
}

function isSameDay(a, b) {
  return (
    a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DashboardStats({ studies = [] }) {
  const total = studies.length;
  const processing = studies.filter((s) => s.status === "processing").length;
  const completedToday = studies.filter((s) => {
    if (s.status !== "completed") return false;
    const d = parseStudyDate(s);
    return isSameDay(d, new Date());
  }).length;

  const items = [
    { label: "Total Studies", value: total, Icon: FileText },
    { label: "Completed Today", value: completedToday, Icon: CheckCircle2 },
    { label: "Processing", value: processing, Icon: Clock },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 md:grid-cols-3">
      {items.map(({ label, value, Icon }, idx) => (
        <div key={idx} className="glass-card rounded-2xl p-6 flex flex-col items-center justify-between text-center h-40">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-[#9333EA] via-[#6366F1] to-[#06B6D4] flex items-center justify-center mb-2">
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className="text-4xl font-semibold leading-none">{value}</div>
          <div className="text-sm text-muted-foreground mt-1">{label}</div>
        </div>
      ))}
    </section>
  );
}
