import { Search, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export default function SearchAndFilters({
    searchTerm,
    setSearchTerm,
    selectedFilter,
    setSelectedFilter,
    counts,
}) {
    const filters = [
        { id: "all", label: "All", count: counts?.all ?? 0 },
        { id: "completed", label: "Completed", count: counts?.completed ?? 0 },
        { id: "processing", label: "Processing", count: counts?.processing ?? 0 },
    ];

    return (
        <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative flex-1">
                <Search className="absolute w-5 h-5 -translate-y-1/2 left-3 top-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search by patient, study UID, or type"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape" && searchTerm) setSearchTerm(""); }}
                    className="h-12 pl-10 pr-12"
                />
                {!!searchTerm && (
                    <button
                        aria-label="Clear search"
                        onClick={() => setSearchTerm("")}
                        className="absolute -translate-y-1/2 right-3 top-1/2 text-muted-foreground hover:text-foreground fast-transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                {filters.map((f) => {
                    const active = selectedFilter === f.id;
                    return (
                        <Button
                            key={f.id}
                            variant={active ? "gradient" : "outline"}
                            onClick={() => setSelectedFilter(f.id)}
                            className="rounded-full px-5 py-2.5"
                        >
                            <span className="mr-2">{f.label}</span>
                            <span className={[
                                "px-2 py-0.5 rounded-full text-xs",
                                active ? "bg-white/20 text-white" : "bg-border text-foreground"
                            ].join(" ")}>
                                {f.count}
                            </span>
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}

