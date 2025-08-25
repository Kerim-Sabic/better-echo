import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Calendar,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
} from "lucide-react";
import {
  listStudiesApi,
  patchStudyApi,
  deleteStudyApi,
} from "../api/StudiesApi";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

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
    // very light guard: accept YYYYMMDD or empty
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

  // Format EF nicely (e.g., "53.4" instead of "53.3999972345")
  const formatEf = (ef) => {
    if (typeof ef !== "number" || !isFinite(ef)) return "—";
    return (Math.round(ef * 10) / 10).toFixed(1); // 1 decimal
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "ready": // backend "done"
      case "completed": // legacy
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "processing":
        return <Clock className="h-4 w-4 text-warning animate-pulse" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status, ef) => {
    const isDone = status === "ready" || status === "completed";
    if (isDone && typeof ef === "number") {
      if (ef >= 55) return <Badge className="status-normal">Normal</Badge>;
      if (ef >= 40) return <Badge className="status-warning">Mild</Badge>;
      return <Badge className="status-critical">Severe</Badge>;
    }
    switch (status) {
      case "ready":
      case "completed":
        return <Badge className="status-normal">Ready</Badge>;
      case "processing":
        return <Badge className="status-warning">Processing</Badge>;
      case "error":
        return <Badge className="status-critical">Error</Badge>;
      default:
        return <Badge variant="outline">{status || "Pending"}</Badge>;
    }
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
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img
                src="/lovable-uploads/9d9bcdf0-8a16-4777-8dc3-85ea7af6f600.png"
                alt="Horalix Logo"
                className="h-8 w-8"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Patient Studies
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage and review echocardiogram analyses
                </p>
              </div>
            </div>

            <Button className="btn-clinical" onClick={onNewStudy}>
              <Plus className="mr-2 h-5 w-5" />
              New Study
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-6 py-6">
        {loading && (
          <div className="text-center py-12">
            <Activity className="h-16 w-16 text-muted-foreground mx-auto mb-4 animate-pulse" />
            <p className="text-muted-foreground">Loading studies…</p>
          </div>
        )}
        {!loading && (
          <div className="grid gap-4">
            {/* Search and Filters */}
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search by Patient ID or Study UID…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>

              <div className="flex gap-2">
                {["all", "ready", "processing"].map((filter) => (
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

            {/* Studies Grid */}
            <div className="grid gap-4">
              {filteredStudies.map((study) => (
                <Card
                  key={study.id}
                  className="card-clinical cursor-pointer hover:scale-[1.01] transition-transform"
                  onClick={() => onSelectStudy(study)}
                >
                  <CardContent className="p-6">
                    {/* 2 columns on md+: left info | right (status+EF top, actions bottom) */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-4 min-h-[160px]">
                      {/* LEFT: avatar + patient/study info, vertically centered */}
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                          <User className="h-6 w-6 text-primary" />
                        </div>

                        <div className="space-y-1">
                          <h3 className="font-semibold text-lg">
                            {study.patient_id || "Unknown patient"}
                          </h3>
                          <p className="text-sm text-muted-foreground truncate" title={study.study_uid || "—"}>
                            Study UID: {study.study_uid || "—"}
                          </p>
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {study.study_date
                                ? `${study.study_date.slice(0, 4)}-${study.study_date.slice(4, 6)}-${study.study_date.slice(6, 8)}`
                                : "Date unknown"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: two rows — top (status+EF), bottom (actions) */}
                      <div className="flex flex-col justify-between items-end">
                        {/* TOP: status + EF */}
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center justify-end space-x-2">
                            {getStatusIcon(study.status)}
                            {getStatusBadge(study.status, study.ef)}
                          </div>

                          {typeof study.ef === "number" && (
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Ejection Fraction</p>
                              <p className="text-2xl font-bold text-primary">{formatEf(study.ef)}%</p>
                            </div>
                          )}

                          {study.status === "processing" && (
                            <p className="text-sm text-muted-foreground max-w-xs">Analysis is running…</p>
                          )}
                        </div>

                        {/* BOTTOM: actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(study);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(study);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit study</DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      Patient ID / MRN
                    </div>
                    <Input
                      value={editForm.patient_id}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          patient_id: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      Study Date (YYYYMMDD)
                    </div>
                    <Input
                      value={editForm.study_date}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          study_date: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={saveEdit} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {filteredStudies.length === 0 && (
              <div className="text-center py-12">
                <Activity className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No studies found
                </h3>
                <p className="text-muted-foreground">
                  {searchTerm
                    ? "Try adjusting your search terms"
                    : "Create your first study to get started"}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
