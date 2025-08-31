import { Upload, FileCheck2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { cn } from "../../lib/utils";

export default function UploadDicomCard({ file, setFile, studyUID, isUploading, onUpload, onReparse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload DICOM</CardTitle>
        <CardDescription>
          Fast lane — just the file. We’ll parse tags automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          className={cn(
            "flex flex-col items-center justify-center w-full h-44 rounded-lg border border-dashed border-border bg-background cursor-pointer",
            "hover:border-primary/60 hover:bg-accent/30 transition-colors"
          )}
        >
          <input
            type="file"
            accept=".dcm,application/dicom"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <div className="font-medium">
                {file ? file.name : "Drop a DICOM here or click to browse"}
              </div>
              <div className="text-sm text-muted-foreground">
                .dcm only • PHI-safe handling recommended
              </div>
            </div>
          </div>
        </label>

        <div className="flex gap-2">
          <Button
            onClick={onUpload}
            disabled={!file || isUploading}
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
