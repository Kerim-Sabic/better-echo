import { Search } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export default function SearchAndFilters({
  searchTerm,
  setSearchTerm,
  selectedFilter,
  setSelectedFilter,
}) {
  return (
    <div className="flex flex-col gap-4 mb-6 lg:flex-row">
      <div className="relative flex-1">
        <Search className="absolute w-5 h-5 -translate-y-1/2 left-3 top-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by Patient ID or Study UID…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-12 pl-10"
        />
      </div>

      <div className="flex gap-2">
        {["all", "completed", "processing"].map((filter) => (
          <Button
            key={filter}
            variant={selectedFilter === filter ? "default" : "outline"}
            onClick={() => setSelectedFilter(filter)}
            className="capitalize"
          >
            {filter}
          </Button>
        ))}
      </div>
    </div>
  );
}
