import { Button } from "../components/ui/button";
import UploadDicomCard from "../features/NewStudy/UploadDicomCard";
import MetadataPreview from "../features/NewStudy/MetadataPreview";
import ManualInfoForm from "../features/NewStudy/ManualInfoForm";

import { useNewStudy } from "../features/NewStudy/hooks/useNewStudy";
import NewStudyHeader from "../features/NewStudy/NewStudyHeader";
import { DuplicateFilesList } from "../features/NewStudy/DuplicateFilesList";

export default function NewStudy() {
  const {
    files,
    setFiles,
    isUploading,
    status,
    studyUID,
    tags,
    showManual,
    setShowManual,
    form,
    setForm,
    handleUpload,
    createStudyAndAnalyze,
    setTags,
    duplicatesFiles,
  } = useNewStudy();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <NewStudyHeader status={status} />

      {/* Content */}
      <main className="container grid gap-6 px-6 py-6 mx-auto">
        <UploadDicomCard
          files={files}
          setFiles={setFiles}
          studyUID={studyUID}
          isUploading={isUploading}
          onUpload={handleUpload}
          onReparse={() => setTags(tags)}
        />

        {/* Show duplicate file names */}
        <DuplicateFilesList files={duplicatesFiles}/>

        {studyUID && <MetadataPreview tags={tags} />}
        {studyUID && (
          <p className="text-sm text-muted-foreground">
            Click <span className="font-medium">Continue to Results</span> to view the study while AI analysis runs.
          </p>
        )}

        <ManualInfoForm
          showManual={showManual}
          setShowManual={setShowManual}
          form={form}
          setForm={setForm}
        />

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button
            className="btn-clinical"
            onClick={createStudyAndAnalyze}
            disabled={!studyUID}
          >
            Continue to Results
          </Button>
        </div>
      </main>
    </div>
  );
}
