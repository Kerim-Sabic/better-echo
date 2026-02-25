import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudiesListQuery } from "@/features/dashboard/tanstack/queries/useStudiesListQuery";
import { useUpdateStudyMutation } from "@/features/dashboard/tanstack/mutations/useUpdateStudyMutation";
import { useDeleteStudyMutation } from "@/features/dashboard/tanstack/mutations/useDeleteStudyMutation";
import { parseStudyDate, formatStudyDate } from "@/features/dashboard/helpers/dashboardHelpers";
import { studyResultsKeys } from "@/features/study_results/tanstack/queryKeys";

/**
 * Dashboard View Model.
 * - Consumes the data layer (useStudiesListQuery) for studies.
 * - Manages all UI state: search, filtering, sorting, and modal visibility (Edit/Delete).
 * - Exposes computed views (filtered lists, counts) and action handlers for the layout.
 */
export function useDashboardPageViewModel() {
  // --- Data Fetching & Mutations (Server State) ---
  const { studies, loading, refresh, setStudies } = useStudiesListQuery();
  const updateStudyMutation = useUpdateStudyMutation();
  const deleteStudyMutation = useDeleteStudyMutation();
  const queryClient = useQueryClient();

  // --- Local UI State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [dateFilters, setDateFilters] = useState([]);
  const [sortBy, setSortBy] = useState("uploaded_desc");

  // --- Modal State ---
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ patient_name: "" });
  const [studyToDelete, setStudyToDelete] = useState(null);

  // --- Actions / Handlers ---
  const openEdit = row => {
    setEditing(row);
    setEditForm({
      patient_name: row?.patient?.patient_name || "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editing?.id) {
      return;
    }

    await updateStudyMutation.mutateAsync({
      studyId: editing.id,
      patchData: editForm,
    });

    await refresh();
    setEditOpen(false);
  };

  const removeStudyResultsCache = studyUid => {
    if (!studyUid) {
      return;
    }

    const keysToRemove = [
      studyResultsKeys.panecho(studyUid),
      studyResultsKeys.dynamicMeasurements(studyUid),
      studyResultsKeys.llmReport(studyUid),
      studyResultsKeys.meta(studyUid),
    ];

    keysToRemove.forEach(queryKey => {
      queryClient.removeQueries({ queryKey, exact: true });
    });
  };

  const onDelete = async row => {
    if (!row?.id) {
      return;
    }

    await deleteStudyMutation.mutateAsync({ studyId: row.id });
    removeStudyResultsCache(row.study_uid);

    // Optimistic UI update for snappier UX while query refetches.
    setStudies(prevStudies => prevStudies.filter(study => study.id !== row.id));
  };

  const confirmDelete = async () => {
    if (!studyToDelete) {
      return;
    }

    try {
      await onDelete(studyToDelete);
    } finally {
      setStudyToDelete(null);
    }
  };

  // --- Derived Data ---
  const searchFiltered = useMemo(() => {
    const normalizedQuery = searchTerm.toLowerCase().trim();

    const isWithinDateRange = study => {
      if (!dateFilters.length) {
        return true;
      }

      const studyDate = parseStudyDate(study);
      if (!studyDate) {
        return false;
      }

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
      const patientName = (study?.patient?.patient_name || "").toLowerCase();
      const studyUid = (study?.study_uid || "").toLowerCase();
      const dateString = formatStudyDate(study).toLowerCase();
      const diagnosisText = (Array.isArray(study?.diagnoses) ? study.diagnoses : []).join(" ").toLowerCase();
      const descriptionText = (study?.description || "").toLowerCase();

      const matchesSearch =
        patientName.includes(normalizedQuery) ||
        studyUid.includes(normalizedQuery) ||
        dateString.includes(normalizedQuery) ||
        descriptionText.includes(normalizedQuery) ||
        diagnosisText.includes(normalizedQuery);

      return matchesSearch && isWithinDateRange(study);
    });
  }, [studies, searchTerm, dateFilters]);

  const filteredStudies = useMemo(() => {
    const filteredByStatus = searchFiltered.filter(
      study => selectedFilter === "all" || study.status === selectedFilter
    );

    const comparator = (a, b) => {
      const uploadedAtA = a.uploaded_at ? new Date(a.uploaded_at) : null;
      const uploadedAtB = b.uploaded_at ? new Date(b.uploaded_at) : null;
      const studyDateA = a.study_date || "";
      const studyDateB = b.study_date || "";
      const nameA = (a.patient?.patient_name || "").toLowerCase();
      const nameB = (b.patient?.patient_name || "").toLowerCase();
      const uidA = (a.study_uid || "").toLowerCase();
      const uidB = (b.study_uid || "").toLowerCase();

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
  }, [searchFiltered, selectedFilter, sortBy]);

  const counts = useMemo(() => {
    const all = searchFiltered.length;
    const completed = searchFiltered.filter(study => study.status === "completed").length;
    const processing = searchFiltered.filter(study => study.status === "processing").length;
    const failed = searchFiltered.filter(study => study.status === "failed").length;

    return { all, completed, processing, failed };
  }, [searchFiltered]);

  // --- Compose View Model ---
  return {
    searchTerm,
    setSearchTerm,
    selectedFilter,
    setSelectedFilter,
    dateFilters,
    setDateFilters,
    sortBy,
    setSortBy,
    studies,
    filteredStudies,
    counts,
    loading,
    editOpen,
    setEditOpen,
    editForm,
    setEditForm,
    openEdit,
    saveEdit,
    saving: updateStudyMutation.isPending,
    studyToDelete,
    setStudyToDelete,
    deleting: deleteStudyMutation.isPending,
    confirmDelete,
    onDelete,
  };
}
