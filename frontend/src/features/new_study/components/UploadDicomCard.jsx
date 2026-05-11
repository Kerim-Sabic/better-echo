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

            <div className="space-y-3">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="glass-card p-5 flex items-center justify-between group hover:bg-muted/30 hover:shadow-lg smooth-transition"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl icon-chip-accent flex items-center justify-center">
                      <FileText className="w-6 h-6 text-accent-main" />
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
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    className="opacity-60 group-hover:opacity-100 smooth-transition hover:bg-destructive/10 hover:text-destructive hover:scale-110"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              ))}
            </div>
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
