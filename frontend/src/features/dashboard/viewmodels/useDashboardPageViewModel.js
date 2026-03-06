import { useMemo, useState } from "react";
import { useStudiesListQuery } from "@/features/dashboard/tanstack/queries/useStudiesListQuery";
import { parseStudyDate, formatStudyDate } from "@/features/dashboard/model/dashboardHelpers";

const normalize = value => String(value ?? "").trim().toLowerCase();

export function useDashboardPageViewModel() {
  // 1. Data Fetching & Mutations (Server State)
  const { data: studies = [], isLoading: isStudiesLoading } = useStudiesListQuery();

  // 2. Local UI State
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [dateFilters, setDateFilters] = useState([]);
  const [sortBy, setSortBy] = useState("uploaded_desc");

  // 3. Computed Data (Filtered List)
  const searchFilteredStudies = useMemo(() => {
    const normalizedQuery = normalize(query);

    const matchesDateFilters = study => {
      if (!dateFilters.length) return true;

      const studyDate = parseStudyDate(study);
      if (!studyDate) return false;

      const studyDateString = studyDate.toISOString().split("T")[0];

      return dateFilters.some(range => {
        const from = range.from;
        const to = range.to || range.from;

        if (from && studyDateString < from) return false;
        if (to && studyDateString > to) return false;
        return true;
      });
    };

    return studies.filter(study => {
      const patientName = normalize(study?.patient?.patientName);
      const studyUid = normalize(study?.studyUid);
      const dateString = normalize(formatStudyDate(study));
      const diagnosisText = normalize((Array.isArray(study?.diagnoses) ? study.diagnoses : []).join(" "));
      const descriptionText = normalize(study?.description);

      const matchesSearch =
        patientName.includes(normalizedQuery) ||
        studyUid.includes(normalizedQuery) ||
        dateString.includes(normalizedQuery) ||
        descriptionText.includes(normalizedQuery) ||
        diagnosisText.includes(normalizedQuery);

      return matchesSearch && matchesDateFilters(study);
    });
  }, [studies, query, dateFilters]);

  const filteredStudies = useMemo(() => {
    const filteredByStatus = searchFilteredStudies.filter(
      study => filter === "all" || study.status === filter
    );

    const comparator = (a, b) => {
      const uploadedAtA = a.uploadedAt ? new Date(a.uploadedAt) : null;
      const uploadedAtB = b.uploadedAt ? new Date(b.uploadedAt) : null;
      const studyDateA = a.studyDate || "";
      const studyDateB = b.studyDate || "";
      const nameA = normalize(a.patient?.patientName);
      const nameB = normalize(b.patient?.patientName);
      const uidA = normalize(a.studyUid);
      const uidB = normalize(b.studyUid);

      switch (sortBy) {
        case "uploaded_asc":
          return (uploadedAtA?.getTime() || 0) - (uploadedAtB?.getTime() || 0);
        case "uploaded_desc":
          return (uploadedAtB?.getTime() || 0) - (uploadedAtA?.getTime() || 0);
        case "study_date_asc":
          return studyDateA.localeCompare(studyDateB);
        case "study_date_desc":
          return studyDateB.localeCompare(studyDateA);
        case "name_asc":
          return nameA.localeCompare(nameB);
        case "name_desc":
          return nameB.localeCompare(nameA);
        case "uid_asc":
          return uidA.localeCompare(uidB);
        case "uid_desc":
          return uidB.localeCompare(uidA);
        default:
          return 0;
      }
    };

    return [...filteredByStatus].sort(comparator);
  }, [searchFilteredStudies, filter, sortBy]);

  // 4. Computed Data (UI Mapping)
  const counts = useMemo(() => {
    const all = searchFilteredStudies.length;
    const completed = searchFilteredStudies.filter(study => study.status === "completed").length;
    const processing = searchFilteredStudies.filter(study => study.status === "processing").length;
    const failed = searchFilteredStudies.filter(study => study.status === "failed").length;

    return { all, completed, processing, failed };
  }, [searchFilteredStudies]);

  return {
    // Data
    studies,
    filteredStudies,
    counts,
    loading: isStudiesLoading,

    // Filter State & Handlers
    query,
    setQuery,
    filter,
    setFilter,
    dateFilters,
    setDateFilters,
    sortBy,
    setSortBy,
  };
}
