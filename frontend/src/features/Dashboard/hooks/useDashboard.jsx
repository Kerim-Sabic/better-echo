import { useState, useEffect, useMemo } from "react";
import { listStudiesApi, patchStudyApi, deleteStudyApi } from "../../../api/StudiesApi";

/**
 * Dashboard data/controller hook.
 * - Loads studies on mount, then polls every 10s (simple overwrite).
 * - Exposes search/filter state, counts, and edit/delete handlers.
 */
export function useDashboard() {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedFilter, setSelectedFilter] = useState("all");
    const [dateFilters, setDateFilters] = useState([]); // [{from, to}]
    const [sortBy, setSortBy] = useState("uploaded_desc");
    const [studies, setStudies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editOpen, setEditOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [editForm, setEditForm] = useState({ patient_name: "", study_date: "" });
    const [saving, setSaving] = useState(false);

    // Load studies initially
    useEffect(() => {
        let cancel = false;
        (async () => {
            try {
                const data = await listStudiesApi();
                if (!cancel) setStudies(data);
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => {
            cancel = true;
        };
    }, []);

    // Poll for updates every 10s (simple overwrite; consider debouncing if collisions matter)
    useEffect(() => {
        const t = setInterval(async () => {
            try {
                const data = await listStudiesApi();
                setStudies(data);
            } catch (err) {
                // intentionally silent; add a guarded console.warn if needed
            }
        }, 10000);
        return () => clearInterval(t);
    }, []);

    // Open edit modal
    const openEdit = (row) => {
        setEditing(row);
        setEditForm({
            patient_name: row.patient?.patient_name || "",
            study_date: row.study_date || "",
        });
        setEditOpen(true);
    };

    // Save study edits
    const saveEdit = async () => {
        if (editForm.study_date && !/^\d{8}$/.test(editForm.study_date)) {
            alert("Study Date must be YYYYMMDD (e.g., 20250131) or left blank.");
            return;
        }
        setSaving(true);
        try {
            await patchStudyApi(editing.id, editForm);
            const data = await listStudiesApi();
            setStudies(data);
            setEditOpen(false);
        } finally {
            setSaving(false);
        }
    };

    // Delete study
    const onDelete = async (row) => {
        await deleteStudyApi(row.id);
        setStudies((prev) => prev.filter((s) => s.id !== row.id));
    };

    // Search-only filtering for counts and status derivations
    const searchFiltered = useMemo(() => {
        const q = searchTerm.toLowerCase();

        const normalizeDate = (study) => {
            if (study?.uploaded_at) {
                const d = new Date(study.uploaded_at);
                if (!isNaN(d)) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const day = String(d.getDate()).padStart(2, "0");
                    return `${y}-${m}-${day}`;
                }
            }
            const sd = study?.study_date;
            if (sd && /^\d{8}$/.test(sd)) {
                return `${sd.slice(0, 4)}-${sd.slice(4, 6)}-${sd.slice(6, 8)}`;
            }
            if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd)) {
                return sd;
            }
            return "";
        };

        const ranges = (dateFilters || []).map((f) => ({
            from: f.from || "",
            to: f.to || f.from || "",
        })).filter((f) => f.from);

        const isWithinDateRange = (study) => {
            if (!ranges.length) return true;
            const d = normalizeDate(study);
            if (!d) return false;
            return ranges.some((r) => {
                if (r.from && d < r.from) return false;
                if (r.to && d > r.to) return false;
                return true;
            });
        };

        return studies.filter((s) => {
            const patientName = (s.patient?.patient_name || "").toLowerCase();
            const suid = (s.study_uid || "").toLowerCase();
            const dateStr = normalizeDate(s);
            const diagText = [
                s?.diagnosis,
                Array.isArray(s?.diagnoses) ? s.diagnoses.join(" ") : "",
                s?.diagnosis_text,
            ].join(" ").toLowerCase();
            const matchesSearch = patientName.includes(q) || suid.includes(q) || dateStr.includes(q) || diagText.includes(q);
            if (!matchesSearch) return false;
            if (!isWithinDateRange(s)) return false;
            return true;
        });
    }, [studies, searchTerm, dateFilters]);

    // Apply status filter to search-filtered results for the list
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
                case "uploaded_asc":
                    return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
                case "uploaded_desc":
                    return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
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
        return [...base].sort(comparator);
    }, [searchFiltered, selectedFilter, sortBy]);

    // Counts for filter chips (reflect current search)
    const counts = useMemo(() => {
        const all = searchFiltered.length;
        const completed = searchFiltered.filter((s) => s.status === "completed").length;
        const processing = searchFiltered.filter((s) => s.status === "processing").length;
        return { all, completed, processing };
    }, [searchFiltered]);

    return {
        searchTerm,        // Current text entered in the search bar
        setSearchTerm,     // Function to update the search term
        selectedFilter,    // Current filter option (e.g., "all", "pending", etc.)
        setSelectedFilter, // Function to update the selected filter
        studies,           // Raw list of studies fetched from API
        filteredStudies,   // Studies after applying search & filter
        counts,            // Counts for All/Completed/Processing
        loading,           // Boolean: true while studies are being loaded
        editOpen,          // Boolean: whether the edit modal is open
        setEditOpen,       // Function to toggle edit modal
        editing,           // The study currently being edited
        editForm,          // Form data for the study being edited
        setEditForm,       // Function to update edit form values
        saving,            // Boolean: true while saving changes
        openEdit,          // Function to open modal and set current study
        saveEdit,          // Function to save changes to a study
        onDelete,          // Function to delete a study
        dateFilters,
        setDateFilters,
        sortBy,
        setSortBy,
    };
}
