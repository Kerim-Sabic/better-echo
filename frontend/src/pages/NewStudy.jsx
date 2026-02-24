import { Button } from "../general_components/ui/button";
import UploadDicomCard from "../features/NewStudy/UploadDicomCard";
import MetadataPreview from "../features/NewStudy/MetadataPreview";

import { useNewStudy } from "../features/NewStudy/hooks/useNewStudy";
import NewStudyHeader from "../features/NewStudy/NewStudyHeader";
import { DuplicateFilesList } from "../features/NewStudy/DuplicateFilesList";
import { TITLEBAR_HEIGHT } from "../general_components/TitleBar";

export default function NewStudy() {
    const {
    files,
    setFiles,
    isUploading,
    status,
    studyUID,
    tags,
    handleUpload,
    createStudyAndAnalyze,
    setTags,
    duplicatesFiles,
    } = useNewStudy();

    return (
        <div className="bg-[#f8f8f8]" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}>
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

                {/* Manual info form removed per new design */}

                <div className="flex items-center justify-end gap-4">
                    <Button variant="outline" onClick={() => window.history.back()} className="h-12 px-8 gap-2">
                        Cancel
                    </Button>
                    <Button
                        variant="gradient"
                        onClick={createStudyAndAnalyze}
                        disabled={!studyUID}
                        className="h-12 px-8 gap-2 shadow-md hover:shadow-lg"
                    >
                        Continue to Results
                    </Button>
                </div>
            </main>
        </div>
    );
}
