import { useState } from "react";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/general_components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/general_components/ui/card";

export default function UploadDicomCard({ newStudyPageViewModel }) {
  const [isActive, setIsActive] = useState(false);

  const {
    files,
    setFiles,
    selectDicomFiles,
    dicomUploadMaxFiles,
    isDicomUploading,
    uploadProgress,
    handleUpload,
  } = newStudyPageViewModel;

  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <CardTitle>Upload DICOM</CardTitle>
        <CardDescription>Click to upload or drag and drop</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div
          className={[
            "relative border-2 border-dashed border-border rounded-2xl p-16 text-center smooth-transition group",
            isActive
              ? "border-accent-soft shadow-[0_0_30px_rgba(85,137,247,0.18)]"
              : "hover:border-primary hover:shadow-[0_0_30px_rgba(85,137,247,0.18)]",
          ].join(" ")}
          onDragEnter={event => {
            event.preventDefault();
            setIsActive(true);
          }}
          onDragOver={event => {
            event.preventDefault();
            setIsActive(true);
          }}
          onDragLeave={event => {
            event.preventDefault();
            setIsActive(false);
          }}
          onDrop={event => {
            event.preventDefault();
            const incomingFiles = Array.from(event.dataTransfer?.files || []);
            if (incomingFiles.length) {
              selectDicomFiles(incomingFiles);
            }
            setIsActive(false);
          }}
        >
          <input
            type="file"
            accept=".dcm,application/dicom"
            multiple
            onChange={event => {
              const incomingFiles = Array.from(event.target.files || []);
              if (!incomingFiles.length) {
                return;
              }
              selectDicomFiles(incomingFiles);
            }}
            className="hidden"
            id="dicom-upload"
          />

          <label htmlFor="dicom-upload" className="cursor-pointer flex flex-col items-center gap-6">
            <div className="w-24 h-24 flex items-center justify-center group-hover:scale-110 smooth-transition">
              <Upload className="w-12 h-12 text-accent-main group-hover:scale-110 smooth-transition" />
            </div>

            <div>
              <p className="text-lg font-semibold text-foreground mb-1">Click to upload or drag and drop</p>
              <p className="text-sm text-muted-foreground">
                DICOM files (.dcm) - up to {dicomUploadMaxFiles} files per study
              </p>
            </div>
          </label>
        </div>

        {files && files.length > 0 && (
          <div className="space-y-3 animate-fade-in" style={{ animationDelay: "80ms" }}>
            <div className="text-base font-semibold text-foreground">Selected Files ({files.length})</div>

            <div
              data-testid="selected-files-grid"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
            >
              {files.map((file, index) => (
                <div
                  key={index}
                  className="glass-card p-3 flex items-center justify-between gap-2 group hover:bg-muted/30 hover:shadow-lg smooth-transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg icon-chip-accent flex shrink-0 items-center justify-center">
                      <FileText className="w-4 h-4 text-accent-main" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" title={file.name}>
                        {file.name}
                      </p>
                      {typeof file.size === "number" && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100 smooth-transition hover:bg-destructive/10 hover:text-destructive hover:scale-110"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isDicomUploading && uploadProgress && (
          <div className="space-y-2 animate-fade-in" data-testid="upload-progress">
            <div className="flex items-center justify-between text-sm gap-3">
              <span className="font-medium text-foreground truncate">
                {uploadProgress.fileIndex > 0
                  ? `Uploading file ${uploadProgress.fileIndex} of ${uploadProgress.totalFiles}`
                  : "Preparing upload..."}
                {uploadProgress.currentFileName ? ` — ${uploadProgress.currentFileName}` : ""}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {uploadProgress.overallPercent}%
              </span>
            </div>

            <div
              className="w-full h-2.5 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={uploadProgress.overallPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-accent-main smooth-transition"
                style={{ width: `${uploadProgress.overallPercent}%` }}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Large studies can take a few minutes over slower connections, please keep this window open.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleUpload}
            disabled={!files || files.length === 0 || isDicomUploading}
            variant="gradient"
            className="h-12 px-8 gap-2 shadow-md hover:shadow-lg"
          >
            {isDicomUploading ? "Uploading..." : "Upload Dicom Files"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
