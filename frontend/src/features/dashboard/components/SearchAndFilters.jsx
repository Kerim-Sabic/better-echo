import React from "react";
import { Search } from "lucide-react";
import { Button } from "@/general_components/ui/button";
import { Input } from "@/general_components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/general_components/ui/select";
import DateFilterPopover from "@/features/dashboard/components/DateFilterPopover";
import "react-multi-date-picker/styles/layouts/prime.css";
import "react-multi-date-picker/styles/colors/teal.css";

const formatIsoToHuman = isoDateString => {
  if (!isoDateString || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateString)) {
    return "";
  }

  const [year, month, day] = isoDateString.split("-");
  return `${day}-${month}-${year}`;
};

export default function SearchAndFilters({ dashboardPageViewModel }) {
  const {
    studySearchInputQuery,
    setStudySearchInputQuery,
    studyStatusFilter,
    setStudyStatusFilter,
    studyStatusCounts,
    studyDateRangeFilters,
    setStudyDateRangeFilters,
    studySortBy,
    setStudySortBy,
  } = dashboardPageViewModel;

  const filterItems = [
    { id: "all", label: "All", count: studyStatusCounts?.all ?? 0 },
    { id: "completed", label: "Completed", count: studyStatusCounts?.completed ?? 0 },
    { id: "processing", label: "Processing", count: studyStatusCounts?.processing ?? 0 },
    { id: "failed", label: "Failed", count: studyStatusCounts?.failed ?? 0 },
  ];

  const getDateSummary = () => {
    if (!Array.isArray(studyDateRangeFilters) || studyDateRangeFilters.length === 0) {
      return "";
    }

    if (studyDateRangeFilters.length > 1) {
      return "Multiple dates applied";
    }

    const firstDateFilter = studyDateRangeFilters[0];
    if (firstDateFilter?.from && firstDateFilter?.to && firstDateFilter.from !== firstDateFilter.to) {
      return `${formatIsoToHuman(firstDateFilter.from)} -> ${formatIsoToHuman(firstDateFilter.to)}`;
    }

    if (firstDateFilter?.from) {
      return formatIsoToHuman(firstDateFilter.from);
    }

    return "";
  };

  const dateSummary = getDateSummary();

  return (
    <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center">
      <div className="relative flex-1 z-50">
        <Search className="absolute w-5 h-5 -translate-y-1/2 left-3 top-1/2 text-muted-foreground" />

        <Input
          placeholder="Search by patient, study UID, diagnosis, or date"
          value={studySearchInputQuery}
          onChange={event => setStudySearchInputQuery(event.target.value)}
          className="h-12 pl-10 pr-24"
        />

        <div className="absolute -translate-y-1/2 right-3 top-1/2">
          <DateFilterPopover
            dateFilters={studyDateRangeFilters}
            setDateFilters={setStudyDateRangeFilters}
          />
        </div>

        {dateSummary && (
          <div className="absolute right-12 -translate-y-1/2 top-1/2 text-[11px] text-muted-foreground bg-white/80 border border-gray-200 rounded-full px-2 py-0.5 max-w-[220px] truncate pointer-events-none">
            {dateSummary}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {filterItems.map(filterItem => {
          const isActive = studyStatusFilter === filterItem.id;

          return (
            <Button
              key={filterItem.id}
              variant={isActive ? "clinical" : "outline"}
              onClick={() => setStudyStatusFilter(filterItem.id)}
              className="rounded-full px-5 py-2.5"
            >
              <span className="mr-2">{filterItem.label}</span>
              <span
                className={[
                  "px-2 py-0.5 rounded-full text-xs",
                  isActive ? "bg-white/20 text-white" : "bg-border text-foreground",
                ].join(" ")}
              >
                {filterItem.count}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="w-full lg:w-52">
        <Select value={studySortBy} onValueChange={setStudySortBy}>
          <SelectTrigger className="h-12 text-sm">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uploaded_desc">Uploaded (newest)</SelectItem>
            <SelectItem value="uploaded_asc">Uploaded (oldest)</SelectItem>
            <SelectItem value="study_date_desc">Study date (newest)</SelectItem>
            <SelectItem value="study_date_asc">Study date (oldest)</SelectItem>
            <SelectItem value="name_asc">Name (A-Z)</SelectItem>
            <SelectItem value="name_desc">Name (Z-A)</SelectItem>
            <SelectItem value="uid_asc">UID (A-Z)</SelectItem>
            <SelectItem value="uid_desc">UID (Z-A)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
