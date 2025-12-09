import { useState, useMemo } from "react";
import { patchStudyApi, deleteStudyApi } from "../../../api/StudiesApi";
import { useStudiesListQuery } from "./useStudiesListQuery";
import { parseStudyDate } from "../helpers/dashboardHelpers";

/**
 * Dashboard View Model.
 * - Consumes the data layer (useStudiesListQuery) for studies.
 * - Manages all UI state: search, filtering, sorting, and modal visibility (Edit/Delete).
 * - Exposes computed views (filtered lists, counts) and action handlers for the layout.
 */
export function useDashboard() {
    // --- Data Layer ---
    const { studies, loading, refresh, setStudies } = useStudiesListQuery();

    // --- UI State ---
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedFilter, setSelectedFilter] = useState("all");
    const [dateFilters, setDateFilters] = useState([]);
    const [sortBy, setSortBy] = useState("uploaded_desc");

    // --- Modal State ---
    const [editOpen, setEditOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [editForm, setEditForm] = useState({ patient_name: "" });
    const [saving, setSaving] = useState(false);

    const [studyToDelete, setStudyToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // --- Actions ---

    const openEdit = (row) => {
        setEditing(row);
        setEditForm({
            patient_name: row.patient?.patient_name || "",
        });
        setEditOpen(true);
    };

    const saveEdit = async () => {
        setSaving(true);
        try {
            await patchStudyApi(editing.id, editForm);
            await refresh(); // Re-fetch data to ensure sync
            setEditOpen(false);
        } finally {
            setSaving(false);
        }
    };

    const onDelete = async (row) => {
        await deleteStudyApi(row.id);
        // Optimistic update
        setStudies((prev) => prev.filter((s) => s.id !== row.id));
    };

    const confirmDelete = async () => {
        if (!studyToDelete) return;
        try {
            setDeleting(true);
            await onDelete(studyToDelete);
        } finally {
            setDeleting(false);
            setStudyToDelete(null);
        }
    };

    // --- Derived Data / Filtering ---

    const searchFiltered = useMemo(() => {
        const q = searchTerm.toLowerCase();

        // Helper: Check if study matches currently selected date ranges
        const isWithinDateRange = (study) => {
            if (!dateFilters.length) return true;
            
            // Use centralized helper to parse date safely
            const dateObj = parseStudyDate(study);
            if (!dateObj) return false;

            // Convert to YYYY-MM-DD string for string comparison (matches date picker output)
            const dStr = dateObj.toISOString().split('T')[0];

            return dateFilters.some((r) => {
                // Single date filter (from only) or range (from and to)
                const from = r.from;
                const to = r.to || r.from; 
                
                if (from && dStr < from) return false;
                if (to && dStr > to) return false;
                return true;
            });
        };

        return studies.filter((s) => {
            const patientName = (s.patient?.patient_name || "").toLowerCase();
            const suid = (s.study_uid || "").toLowerCase();
            
            // Re-using parseStudyDate for search text matching
            const dateObj = parseStudyDate(s);
            const dateStr = dateObj ? dateObj.toISOString().split('T')[0] : "";
            
            const diagText = [
                s?.diagnosis,
                Array.isArray(s?.diagnoses) ? s.diagnoses.join(" ") : "",
                s?.diagnosis_text,
            ].join(" ").toLowerCase();

            const matchesSearch = 
                patientName.includes(q) || 
                suid.includes(q) || 
                dateStr.includes(q) || 
                diagText.includes(q);

            if (!matchesSearch) return false;
            if (!isWithinDateRange(s)) return false;
            return true;
        });
    }, [studies, searchTerm, dateFilters]);

    const filteredStudies = useMemo(() => {
        const base = searchFiltered.filter((s) => selectedFilter === "all" || s.status === selectedFilter);
        
        const comparator = (a, b) => {
            const dateA = a.uploaded_at ? new Date(a.uploaded_at) : null;
            const dateB = b.uploaded_at ? new Date(b.uploaded_at) : null;
            const studyDateA = a.study_date || "";
            const studyDateB = b.study_date || "";
            const nameA = (a.patient?.patient_name || "").toLowerCase();
            const nameB = (b.patient?.patient_name || "").toLowerCase();
            const uidA = (a.study_uid || "").toLowerCase();
            const uidB = (b.study_uid || "").toLowerCase();

            switch (sortBy) {
                case "uploaded_asc": return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
                case "uploaded_desc": return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
                case "study_date_asc": return studyDateA.localeCompare(studyDateB);
                case "study_date_desc": return studyDateB.localeCompare(studyDateA);
                case "name_asc": return nameA.localeCompare(nameB);
                case "name_desc": return nameB.localeCompare(nameA);
                case "uid_asc": return uidA.localeCompare(uidB);
                case "uid_desc": return uidB.localeCompare(uidA);
                default: return 0;
            }
        };
        return [...base].sort(comparator);
    }, [searchFiltered, selectedFilter, sortBy]);

    const counts = useMemo(() => {
        const all = searchFiltered.length;
        const completed = searchFiltered.filter((s) => s.status === "completed").length;
        const processing = searchFiltered.filter((s) => s.status === "processing").length;
        return { all, completed, processing };
    }, [searchFiltered]);

    return {
        // Data
        searchTerm, setSearchTerm,
        selectedFilter, setSelectedFilter,
        dateFilters, setDateFilters,
        sortBy, setSortBy,
        studies, filteredStudies, counts,
        loading,
        
        // Edit
        editOpen, setEditOpen,
        editForm, setEditForm,
        openEdit, saveEdit, saving,
        
        // Delete
        studyToDelete, setStudyToDelete,
        deleting, confirmDelete,
        onDelete,
    };
}