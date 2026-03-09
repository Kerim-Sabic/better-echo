import { Button } from "@/general_components/ui/button";
import { TITLEBAR_HEIGHT } from "@/general_components/TitleBar";
import {
  DuplicateFilesList,
  MetadataPreview,
  NewStudyHeader,
  UploadDicomCard,
} from "@/features/new_study/components";

export default function NewStudyLayout({ viewModel }) {
  const {
    files,
    setFiles,
    isUploading,
    status,
    studyUID,
    tags,
    handleUpload,
    createStudyAndAnalyze,
    cancelAndGoBack,
    setTags,
    duplicatesFiles,
    isContinuingToResults,
    isCancellingPipeline,
  } = viewModel;

  return (
    <div className="bg-[#f8f8f8]" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}>
      <NewStudyHeader status={status} />

      <main className="container grid gap-6 px-6 py-6 mx-auto">
        <UploadDicomCard
          files={files}
          setFiles={setFiles}
          studyUID={studyUID}
          isUploading={isUploading}
          onUpload={handleUpload}
          onReparse={() => setTags(tags)}
        />

        <DuplicateFilesList files={duplicatesFiles} />

        {studyUID && <MetadataPreview tags={tags} />}
        {studyUID && (
          <p className="text-sm text-muted-foreground">
            Click <span className="font-medium">Continue to Results</span> to view the study while AI
            analysis runs.
          </p>
        )}

        <div className="flex items-center justify-end gap-4">
          <Button
            variant="outline"
            onClick={cancelAndGoBack}
            disabled={isCancellingPipeline || isContinuingToResults || isUploading}
            className="h-12 px-8 gap-2"
          >
            {isCancellingPipeline ? "Cancelling..." : "Cancel"}
          </Button>
          <Button
            variant="gradient"
            onClick={createStudyAndAnalyze}
            disabled={!studyUID || isContinuingToResults || isUploading || isCancellingPipeline}
            className="h-12 px-8 gap-2 shadow-md hover:shadow-lg"
          >
            {isContinuingToResults ? "Preparing..." : "Continue to Results"}
          </Button>
        </div>
      </main>
    </div>
  );
}
