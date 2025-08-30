import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity } from "lucide-react";

import { listStudiesApi, patchStudyApi, deleteStudyApi } from "../api/StudiesApi";
import DashboardHeader from "../features/Dashboard/DashboardHeader";
import SearchAndFilters from "../features/Dashboard/SearchAndFilters";
import StudyList from "../features/Dashboard/StudyList";
import EditStudyDialog from "../features/Dashboard/EditStudyDialog";


export default function Dashboard() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ patient_id: "", study_date: "" });
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const data = await listStudiesApi();
        setStudies(data);
      } catch {}
    }, 10000);
    return () => clearInterval(t);
  }, []);

  const openEdit = (row) => {
    setEditing(row);
    setEditForm({
      patient_id: row.patient_id || "",
      study_date: row.study_date || "",
    });
    setEditOpen(true);
  };

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

  const onDelete = async (row) => {
    if (!window.confirm("Delete this study? This cannot be undone.")) return;
    await deleteStudyApi(row.id);
    setStudies((prev) => prev.filter((s) => s.id !== row.id));
  };

  const filteredStudies = studies.filter((s) => {
    const q = searchTerm.toLowerCase();
    const pid = (s.patient_id || "").toLowerCase();
    const suid = (s.study_uid || "").toLowerCase();
    const matchesSearch = pid.includes(q) || suid.includes(q);
    const matchesFilter =
      selectedFilter === "all" || s.status === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  const onNewStudy = () => navigate("/studies/new");
  const onSelectStudy = (study) =>
    navigate(`/studies/${encodeURIComponent(study.study_uid || study.id)}`);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onNewStudy={onNewStudy} />

      <main className="container px-6 py-6 mx-auto">
        {loading && (
          <div className="py-12 text-center">
            <Activity className="w-16 h-16 mx-auto mb-4 text-muted-foreground animate-pulse" />
            <p className="text-muted-foreground">Loading studies…</p>
          </div>
        )}
        {!loading && (
          <>
            <SearchAndFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              selectedFilter={selectedFilter}
              setSelectedFilter={setSelectedFilter}
            />

            <StudyList
              studies={filteredStudies}
              onSelectStudy={onSelectStudy}
              onEdit={openEdit}
              onDelete={onDelete}
            />

            <EditStudyDialog
              open={editOpen}
              setOpen={setEditOpen}
              editForm={editForm}
              setEditForm={setEditForm}
              onSave={saveEdit}
              saving={saving}
            />

            {filteredStudies.length === 0 && (
              <div className="py-12 text-center">
                <Activity className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium text-foreground">
                  No studies found
                </h3>
                <p className="text-muted-foreground">
                  {searchTerm
                    ? "Try adjusting your search terms"
                    : "Create your first study to get started"}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
