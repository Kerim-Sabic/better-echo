import { useNavigate } from "react-router-dom";
import { Activity } from "lucide-react";

import DashboardHeader from "../features/Dashboard/DashboardHeader";
import SearchAndFilters from "../features/Dashboard/SearchAndFilters";
import DashboardStats from "../features/Dashboard/DashboardStats";
import StudyList from "../features/Dashboard/StudyList";
import EditStudyDialog from "../features/Dashboard/EditStudyDialog";

import { useDashboard } from "../features/Dashboard/hooks/useDashboard";
import { TITLEBAR_HEIGHT } from "../components/TitleBar";

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    searchTerm,
    setSearchTerm,
    selectedFilter,
    setSelectedFilter,
    filteredStudies,
    studies,
    counts,
    loading,
    editOpen,
    setEditOpen,
    editForm,
    setEditForm,
    saving,
    openEdit,
    saveEdit,
    onDelete,
  } = useDashboard();

  const onNewStudy = () => navigate("/studies/new");
  const onSelectStudy = (study) =>
    navigate(`/studies/${encodeURIComponent(study.study_uid || study.id)}`);

  return (
    <div className="bg-[#f8f8f8]" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)`}}>
      <DashboardHeader onNewStudy={onNewStudy} />

      <main className="container px-6 py-6 mx-auto">
        {loading && (
          <div className="py-12 text-center">
            <Activity className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
            <p className="text-muted-foreground">Loading studies…</p>
          </div>
        )}
        {!loading && (
          <>
            <DashboardStats studies={studies} />

            <SearchAndFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              selectedFilter={selectedFilter}
              setSelectedFilter={setSelectedFilter}
              counts={counts}
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
                <Activity className="w-16 h-16 mx-auto mb-4 text-primary" />
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

