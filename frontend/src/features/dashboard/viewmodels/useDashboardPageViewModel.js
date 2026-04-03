import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStudiesListQuery } from "@/features/dashboard/tanstack/queries/useStudiesListQuery";

// Normalizes text values for case-insensitive matching in search/filter logic.
const normalize = value => String(value ?? "").trim().toLowerCase();

// Converts YYYY-MM-DD to YYYYMMDD (and leaves YYYYMMDD unchanged) for date comparisons.
const toStudyDateKey = value => String(value ?? "").replaceAll("-", "").trim();

export function useDashboardPageViewModel() {
  const navigate = useNavigate();

  // 1. Data Fetching & Mutations (Server State)
  const { data: studies = [], isLoading: isStudiesLoading } = useStudiesListQuery();

  // 2. Local UI State
  const [studySearchInputQuery, setStudySearchInputQuery] = useState("");
  const [studyStatusFilter, setStudyStatusFilter] = useState("all");
  const [studyDateRangeFilters, setStudyDateRangeFilters] = useState([]);
  const [studySortBy, setStudySortBy] = useState("uploaded_desc");

  // 3. Computed Data (Filtered List)
  // Applies search + date filter on the studies list.
  const searchFilteredStudies = useMemo(() => {
    const normalizedQuery = normalize(studySearchInputQuery);

    const matchesDateFilters = study => {
      if (!studyDateRangeFilters.length) return true;

      // Normalized YYYYMMDD key from DTO study date.
      const studyDateKey = toStudyDateKey(study?.studyDate);
      // Reject when study has no valid comparable date key.
      if (!/^\d{8}$/.test(studyDateKey)) return false;

      // Study passes if it matches at least one selected range.
      return studyDateRangeFilters.some(range => {
        // Start date key.
        const fromKey = toStudyDateKey(range?.from);
        // End date key (single-day range when "to" is missing).
        const toKey = toStudyDateKey(range?.to || range?.from);

        if (fromKey && studyDateKey < fromKey) return false;
        if (toKey && studyDateKey > toKey) return false;
        return true;
      });
    };

    // Search filter across patient, uid, dates, description, diagnoses.
    return studies.filter(study => {
      const patientName = normalize(study?.patient?.patientName);
      const studyUid = normalize(study?.studyUid);
      const studyDateLabel = normalize(study?.studyDateLabel);
      const uploadedAtLabel = normalize(study?.uploadedAtLabel);
      const diagnosisText = normalize((Array.isArray(study?.diagnoses) ? study.diagnoses : []).join(" "));
      const descriptionText = normalize(study?.description);

      // True when query matches at least one searchable field.
      const matchesSearch =
        patientName.includes(normalizedQuery) ||
        studyUid.includes(normalizedQuery) ||
        studyDateLabel.includes(normalizedQuery) ||
        uploadedAtLabel.includes(normalizedQuery) ||
        descriptionText.includes(normalizedQuery) ||
        diagnosisText.includes(normalizedQuery);

      return matchesSearch && matchesDateFilters(study);
    });
  }, [studies, studySearchInputQuery, studyDateRangeFilters]);

  // Applies status filter and sorting to already search-filtered data.
  const filteredStudies = useMemo(() => {
    // First apply status filter.
    const filteredByStatus = searchFilteredStudies.filter(
      study => studyStatusFilter === "all" || study.status === studyStatusFilter
    );

    // Sort comparator driven by selected sort option.
    const comparator = (a, b) => {
      // Upload date for study A.
      const uploadedAtA = a.uploadedAt ? new Date(a.uploadedAt) : null;
      // Upload date for study B.
      const uploadedAtB = b.uploadedAt ? new Date(b.uploadedAt) : null;
      // Raw study date for study A.
      const studyDateA = a.studyDate || "";
      // Raw study date for study B.
      const studyDateB = b.studyDate || "";
      // Normalized patient name for study A.
      const nameA = normalize(a.patient?.patientName);
      // Normalized patient name for study B.
      const nameB = normalize(b.patient?.patientName);
      // Normalized UID for study A.
      const uidA = normalize(a.studyUid);
      // Normalized UID for study B.
      const uidB = normalize(b.studyUid);

      switch (studySortBy) {
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
  }, [searchFilteredStudies, studyStatusFilter, studySortBy]);

  // 4. Computed Data (UI Mapping)
  // Builds status counters for stats widgets.
  const studyStatusCounts = useMemo(() => {
    // Total studies after search/date filtering.
    const all = searchFilteredStudies.length;
    const completed = searchFilteredStudies.filter(study => study.status === "completed").length;
    const processing = searchFilteredStudies.filter(study => study.status === "processing").length;
    const failed = searchFilteredStudies.filter(study => study.status === "failed").length;

    return { all, completed, processing, failed };
  }, [searchFilteredStudies]);

  // 5. Navigation Handlers
  // Navigates to New Study page.
  const onNewStudy = useCallback(() => {
    navigate("/studies/new");
  }, [navigate]);

  // Navigates to selected Study Results Page.
  const onSelectStudy = useCallback(
    study => {
      const targetStudy = study?.studyUid;
      if (!targetStudy) return;

      navigate(`/studies/${encodeURIComponent(targetStudy)}`);
    },
    [navigate]
  );

  return {
    allStudies: studies,
    filteredStudies,
    studyStatusCounts,
    isStudiesLoading,

    studySearchInputQuery,
    setStudySearchInputQuery,
    studyStatusFilter,
    setStudyStatusFilter,
    studyDateRangeFilters,
    setStudyDateRangeFilters,
    studySortBy,
    setStudySortBy,

    onNewStudy,
    onSelectStudy,
  };
}
