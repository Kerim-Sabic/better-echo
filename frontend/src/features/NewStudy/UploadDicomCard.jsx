import { Upload, FileCheck2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { cn } from "../../lib/utils";

export default function UploadDicomCard({ files, setFiles, studyUID, isUploading, onUpload, onReparse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload DICOM</CardTitle>
        <CardDescription>
          Fast lane — just the files. We’ll parse tags automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          className={cn(
            "flex flex-col items-center justify-center w-full rounded-lg border border-dashed border-border cursor-pointer",
            // Soft brand-tinted background with stronger hover
            "bg-gradient-to-br from-[#9333EA]/10 via-[#6366F1]/10 to-[#06B6D4]/10",
            "hover:border-[#06B6D4]/60 hover:from-[#9333EA]/20 hover:via-[#6366F1]/20 hover:to-[#06B6D4]/20 transition-colors"
          )}
          style={{ minHeight: "11rem", padding: "1rem" }} // minimum height for the upload area
        >
          <input
            type="file"
            accept=".dcm,application/dicom"
            hidden
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files) || [])}
          />
          <div className="flex items-start w-full gap-3">
            <div className="flex-shrink-0 p-2 rounded-md bg-gradient-to-r from-[#9333EA]/10 via-[#6366F1]/10 to-[#06B6D4]/10">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <div 
                className="flex flex-wrap gap-1 overflow-y-auto font-medium max-h-48"
              >
                {files && files.length
                  ? files.map((f, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 text-sm break-words rounded bg-brand-soft"
                      >
                        {f.name}
                      </span>
                    ))
                  : "Drop DICOM files here or click to browse"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                .dcm only • PHI-safe handling recommended
              </div>
            </div>
          </div>
        </label>

        <div className="flex gap-2">
          <Button
            onClick={onUpload}
            disabled={!files || isUploading}
            className="h-11"
          >
            {isUploading ? "Uploading…" : "Upload & Parse Tags"}
          </Button>
          {studyUID && (
            <Button
              variant="outline"
              className="h-11"
              onClick={onReparse}
            >
              <FileCheck2 className="w-4 h-4 mr-2" />
              Re-parse
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
