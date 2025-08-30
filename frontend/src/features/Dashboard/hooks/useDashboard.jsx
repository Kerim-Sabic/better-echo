import { useState, useEffect } from "react";
import { listStudiesApi, patchStudyApi, deleteStudyApi } from "../../../api/StudiesApi";

export function useDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ patient_id: "", study_date: "" });
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
      patient_id: row.patient_id || "",
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
    if (!window.confirm("Delete this study? This cannot be undone.")) return;
    await deleteStudyApi(row.id);
    setStudies((prev) => prev.filter((s) => s.id !== row.id));
  };

  // Filter logic
  const filteredStudies = studies.filter((s) => {
    const q = searchTerm.toLowerCase();
    const pid = (s.patient_id || "").toLowerCase();
    const suid = (s.study_uid || "").toLowerCase();
    const matchesSearch = pid.includes(q) || suid.includes(q);
    const matchesFilter =
      selectedFilter === "all" || s.status === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  return {
    searchTerm,
    setSearchTerm,
    selectedFilter,
    setSelectedFilter,
    studies,
    filteredStudies,
    loading,
    editOpen,
    setEditOpen,
    editing,
    editForm,
    setEditForm,
    saving,
    openEdit,
    saveEdit,
    onDelete,
  };
}
