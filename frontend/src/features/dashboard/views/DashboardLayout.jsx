import React from "react";
import { Activity } from "lucide-react";

import DashboardHeader from "../components/Header/Header";
import SearchAndFilters from "../components/Search/SearchAndFilters";
import DashboardStats from "../components/Stats/DashboardStats";
import StudyList from "../components/Studies/StudyList";
import EditStudyDialog from "../components/Studies/EditStudyDialog";
import DeleteStudyDialog from "../components/Studies/DeleteStudyDialog";
import { TITLEBAR_HEIGHT } from "../../../general_components/TitleBar";

export default function DashboardLayout({
  dashboardPageViewModel,
  editStudyModalViewModel,
  onNewStudy,
  onSelectStudy,
}) {
  const {
    // Data
    studies,
    filteredStudies,
    counts,
    loading,

    // Filter State & Handlers
    query,
    setQuery,
    filter,
    setFilter,
    dateFilters,
    setDateFilters,
    sortBy,
    setSortBy,
  } = dashboardPageViewModel;

  const {
    // Data
    editForm,
    studyToDelete,

    // Edit Modal State & Handlers
    isEditStudyModalOpen,
    setEditForm,
    openEditStudyModal,
    closeEditStudyModal,
    saveEditStudy,
    isSavingEditStudy,

    // Delete Modal State & Handlers
    openDeleteStudyModal,
    closeDeleteStudyModal,
    confirmDeleteStudy,
    isDeletingStudy,
  } = editStudyModalViewModel;
  console.log("DASHBOARD PAGE VIEWMODEL", dashboardPageViewModel)
  console.log("EDIT STUDY MODAL VIEWMODEL", editStudyModalViewModel)

  return (
    <div className="bg-[#f8f8f8]" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}>
      <DashboardHeader onNewStudy={onNewStudy} />

      <main className="container px-6 py-6 mx-auto">
        {loading && (
          <div className="py-12 text-center">
            <Activity className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
            <p className="text-muted-foreground">Loading studies...</p>
          </div>
        )}

        {!loading && (
          <>
            <DashboardStats studies={studies} />

            <SearchAndFilters
              searchTerm={query}
              setSearchTerm={setQuery}
              selectedFilter={filter}
              setSelectedFilter={setFilter}
              counts={counts}
              sortBy={sortBy}
              setSortBy={setSortBy}
              dateFilters={dateFilters}
              setDateFilters={setDateFilters}
            />

            <StudyList
              studies={filteredStudies}
              onSelectStudy={onSelectStudy}
              onEdit={openEditStudyModal}
              onDelete={openDeleteStudyModal}
            />

            <EditStudyDialog
              open={isEditStudyModalOpen}
              setOpen={open => {
                if (!open) {
                  closeEditStudyModal();
                }
              }}
              editForm={editForm}
              setEditForm={setEditForm}
              onSave={saveEditStudy}
              saving={isSavingEditStudy}
            />

            <DeleteStudyDialog
              open={!!studyToDelete}
              study={studyToDelete}
              busy={isDeletingStudy}
              onCancel={closeDeleteStudyModal}
              onConfirm={confirmDeleteStudy}
            />

            {filteredStudies.length === 0 && (
              <div className="py-12 text-center">
                <Activity className="w-16 h-16 mx-auto mb-4 text-primary" />
                <h3 className="mb-2 text-lg font-medium text-foreground">No studies found</h3>
                <p className="text-muted-foreground">
                  {query ? "Try adjusting your search terms" : "Create your first study to get started"}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
