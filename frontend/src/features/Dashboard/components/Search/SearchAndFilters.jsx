import { Search } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import "react-multi-date-picker/styles/layouts/prime.css";
import "react-multi-date-picker/styles/colors/teal.css";
import DateFilterPopover from "./DateFilterPopover";
import { formatIsoToHuman } from "../../helpers/dashboardHelpers";

export default function SearchAndFilters({
    searchTerm,
    setSearchTerm,
    selectedFilter,
    setSelectedFilter,
    counts,
    dateFilters,
    setDateFilters,
    sortBy,
    setSortBy,
}) {
    const filters = [
        { id: "all", label: "All", count: counts?.all ?? 0 },
        { id: "completed", label: "Completed", count: counts?.completed ?? 0 },
        { id: "processing", label: "Processing", count: counts?.processing ?? 0 },
    ];

    const dateSummary = () => {
        if (!dateFilters || !dateFilters.length) return "";
        if (dateFilters.length > 1) return "Multiple dates applied";
        const first = dateFilters[0];
        if (first.from && first.to && first.from !== first.to) {
            return `${formatIsoToHuman(first.from)} → ${formatIsoToHuman(first.to)}`;
        }
        if (first.from) return formatIsoToHuman(first.from);
        return "";
    };

    return (
        <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center">
            <div className="relative flex-1 z-50">
                
                {/* Search Icon */}
                <Search className="absolute w-5 h-5 -translate-y-1/2 left-3 top-1/2 text-muted-foreground" />
                
                {/* Search Input */}
                <Input
                    placeholder="Search by patient, study UID, diagnosis, or date"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    // onKeyDown={(e) => { if (e.key === "Escape" && searchTerm) setSearchTerm(""); }}
                    className="h-12 pl-10 pr-24"
                />
                
                {/* MODULAR DATE COMPONENT */}
                <div className="absolute -translate-y-1/2 right-3 top-1/2">
                    <DateFilterPopover 
                        dateFilters={dateFilters} 
                        setDateFilters={setDateFilters} 
                    />
                </div>

                {/* Summary Text Badge (Visual only) */}
                {dateSummary() && (
                    <div className="absolute right-12 -translate-y-1/2 top-1/2 text-[11px] text-muted-foreground bg-white/80 border border-gray-200 rounded-full px-2 py-0.5 max-w-[220px] truncate pointer-events-none">
                        {dateSummary()}
                    </div>
                )}
            </div>

            {/* Filter Buttons (All/Completed/Processing) */}
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

            {/* Sort Dropdown */}
            <div className="flex flex-col gap-1 w-full lg:w-52">
                <select
                    className="h-12 border rounded-md px-3 text-sm bg-white"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                >
                    <option value="uploaded_desc">Uploaded (newest)</option>
                    <option value="uploaded_asc">Uploaded (oldest)</option>
                    <option value="study_date_desc">Study date (newest)</option>
                    <option value="study_date_asc">Study date (oldest)</option>
                </select>
            </div>
        </div>
    );
}
