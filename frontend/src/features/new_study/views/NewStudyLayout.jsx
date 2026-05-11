import { Button } from "@/general_components/ui/button";
import { TITLEBAR_HEIGHT } from "@/general_components/TitleBar";
import {
  DuplicateFilesList,
  MetadataPreview,
  NewStudyHeader,
  UploadDicomCard,
} from "@/features/new_study/components";

export default function NewStudyLayout({ newStudyPageViewModel }) {
  return (
    <div
      className="flex flex-col bg-[#f8f8f8]"
      style={{ height: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}
    >
      <NewStudyHeader newStudyPageViewModel={newStudyPageViewModel} />

      <main data-testid="new-study-scroll-region" className="min-h-0 flex-1 overflow-y-auto">
        <div className="container grid gap-6 px-6 py-6 mx-auto">
          <UploadDicomCard newStudyPageViewModel={newStudyPageViewModel} />

          <DuplicateFilesList newStudyPageViewModel={newStudyPageViewModel} />

          {newStudyPageViewModel.studyUID && (
            <MetadataPreview newStudyPageViewModel={newStudyPageViewModel} />
          )}

          {newStudyPageViewModel.studyUID && (
            <p className="text-sm text-muted-foreground">
              Click <span className="font-medium">Continue to Results</span> to view the study while
              AI analysis runs.
            </p>
          )}
        </div>
      </main>

      <footer
        data-testid="new-study-action-footer"
        className="shrink-0 border-t border-border bg-card px-6 py-4 shadow-[0_-12px_30px_rgba(15,23,42,0.08)]"
      >
        <div className="container mx-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          <Button
            variant="outline"
            onClick={newStudyPageViewModel.cancelAndGoBack}
            disabled={
              newStudyPageViewModel.isCancellingPipeline ||
              newStudyPageViewModel.isContinuingToResults ||
              newStudyPageViewModel.isDicomUploading
            }
            className="h-12 px-8 gap-2"
          >
            {newStudyPageViewModel.isCancellingPipeline ? "Cancelling..." : "Cancel"}
          </Button>

          <Button
            variant="gradient"
            onClick={newStudyPageViewModel.createStudyAndGoToResults}
            disabled={
              !newStudyPageViewModel.studyUID ||
              newStudyPageViewModel.isContinuingToResults ||
              newStudyPageViewModel.isDicomUploading ||
              newStudyPageViewModel.isCancellingPipeline
            }
            className="h-12 px-8 gap-2 shadow-md hover:shadow-lg"
          >
            {newStudyPageViewModel.isContinuingToResults ? "Preparing..." : "Continue to Results"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
