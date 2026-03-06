import { FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { parseStudyDate, isSameDay } from "../../model/dashboardHelpers";

export default function DashboardStats({ studies = [] }) {
    const total = studies.length;
    const processing = studies.filter((s) => s.status === "processing").length;
    const failed = studies.filter((s) => s.status === "failed").length;
    const completedToday = studies.filter((s) => {
        if (s.status !== "completed") return false;
        const d = parseStudyDate(s);
        return isSameDay(d, new Date());
    }).length;

    const items = [
        { label: "Total Studies", value: total, Icon: FileText },
        { label: "Completed Today", value: completedToday, Icon: CheckCircle2 },
        { label: "Processing", value: processing, Icon: Clock },
        { label: "Failed", value: failed, Icon: AlertCircle },
    ];

    return (
        <section className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 md:grid-cols-4">
            {items.map(({ label, value, Icon }, idx) => (
                <div key={idx} className="glass-card rounded-2xl p-6 flex flex-col items-center justify-between text-center h-40">
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
