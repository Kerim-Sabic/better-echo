import { useState, useEffect, useMemo } from "react";
import { listStudiesApi, patchStudyApi, deleteStudyApi } from "../../../api/StudiesApi";

export function useDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
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

  // Poll for updates every 10s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const data = await listStudiesApi();
        setStudies(data);
      } catch {}
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
    return studies.filter((s) => {
      const patientName = (s.patient?.patient_name || "").toLowerCase();
      const suid = (s.study_uid || "").toLowerCase();
      return patientName.includes(q) || suid.includes(q);
    });
  }, [studies, searchTerm]);

  // Apply status filter to search-filtered results for the list
  const filteredStudies = useMemo(() => {
    return searchFiltered.filter((s) => selectedFilter === "all" || s.status === selectedFilter);
  }, [searchFiltered, selectedFilter]);

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
  };
}
