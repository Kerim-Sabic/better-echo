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
    <div className="bg-[#f8f8f8]" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}>
      <NewStudyHeader newStudyPageViewModel={newStudyPageViewModel} />

      <main className="container grid gap-6 px-6 py-6 mx-auto">
        <UploadDicomCard newStudyPageViewModel={newStudyPageViewModel} />

        <DuplicateFilesList newStudyPageViewModel={newStudyPageViewModel} />

        {newStudyPageViewModel.studyUID && (
          <MetadataPreview newStudyPageViewModel={newStudyPageViewModel} />
        )}

        {newStudyPageViewModel.studyUID && (
          <p className="text-sm text-muted-foreground">
            Click <span className="font-medium">Continue to Results</span> to view the study while AI
            analysis runs.
          </p>
        )}

        <div className="flex items-center justify-end gap-4">
          <Button
            variant="outline"
            onClick={newStudyPageViewModel.cancelAndGoBack}
            disabled={
              newStudyPageViewModel.isCancellingPipeline ||
              newStudyPageViewModel.isContinuingToResults ||
              newStudyPageViewModel.isUploading
            }
            className="h-12 px-8 gap-2"
          >
            {newStudyPageViewModel.isCancellingPipeline ? "Cancelling..." : "Cancel"}
          </Button>

          <Button
            variant="gradient"
            onClick={newStudyPageViewModel.createStudyAndAnalyze}
            disabled={
              !newStudyPageViewModel.studyUID ||
              newStudyPageViewModel.isContinuingToResults ||
              newStudyPageViewModel.isUploading ||
              newStudyPageViewModel.isCancellingPipeline
            }
            className="h-12 px-8 gap-2 shadow-md hover:shadow-lg"
          >
            {newStudyPageViewModel.isContinuingToResults ? "Preparing..." : "Continue to Results"}
          </Button>
        </div>
      </main>
    </div>
  );
}
