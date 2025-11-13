import { useNavigate } from "react-router-dom";
import { Activity } from "lucide-react";

import DashboardHeader from "../features/Dashboard/DashboardHeader";
import SearchAndFilters from "../features/Dashboard/SearchAndFilters";
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
    <div className="bg-background" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT})`}}>
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
