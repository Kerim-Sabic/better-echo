import React from "react";
import { Activity } from "lucide-react";

import DashboardHeader from "../components/Header/Header";
import SearchAndFilters from "../components/Search/SearchAndFilters";
import DashboardStats from "../components/Stats/DashboardStats";
import StudyList from "../components/Studies/StudyList";
import EditStudyDialog from "../components/Studies/EditStudyDialog";
import DeleteStudyDialog from "../components/Studies/DeleteStudyDialog";
import { TITLEBAR_HEIGHT } from "../../../general_components/TitleBar";

export default function DashboardLayout({ viewModel, onNewStudy, onSelectStudy }) {
    const {
        // State
        searchTerm,
        selectedFilter,
        filteredStudies,
        studies,
        counts,
        loading,
        editOpen,
        editForm,
        saving,
        dateFilters,
        sortBy,
        studyToDelete,
        deleting,

        // Actions
        setSearchTerm,
        setSelectedFilter,
        setEditOpen,
        setEditForm,
        openEdit,
        saveEdit,
        setDateFilters,
        setSortBy,
        setStudyToDelete,
        confirmDelete,
    } = viewModel;

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
                            sortBy={sortBy}
                            setSortBy={setSortBy}
                            dateFilters={dateFilters}
                            setDateFilters={setDateFilters}
                        />

                        <StudyList
                            studies={filteredStudies}
                            onSelectStudy={onSelectStudy}
                            onEdit={openEdit}
                            onDelete={(s) => setStudyToDelete(s)}
                        />

                        <EditStudyDialog
                            open={editOpen}
                            setOpen={setEditOpen}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            onSave={saveEdit}
                            saving={saving}
                        />

                        <DeleteStudyDialog
                            open={!!studyToDelete}
                            study={studyToDelete}
                            busy={deleting}
                            onCancel={() => setStudyToDelete(null)}
                            onConfirm={confirmDelete}
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