import { useState } from "react";
import { Upload, FileCheck2, X, FileText } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";

export default function UploadDicomCard({ files, setFiles, studyUID, isUploading, onUpload, onReparse }) {
  const [isActive, setIsActive] = useState(false);

  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <CardTitle>Upload DICOM</CardTitle>
        <CardDescription>Click to upload or drag and drop</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dropzone */}
        <div
          className={[
            "relative border-2 border-dashed border-border rounded-2xl p-16 text-center smooth-transition group",
            isActive
              ? "border-[#9333EA] shadow-[0_0_30px_rgba(147,51,234,0.18)]"
              : "hover:border-[#9333EA] hover:shadow-[0_0_30px_rgba(147,51,234,0.18)]",
          ].join(" ")}
          onDragEnter={(e) => { e.preventDefault(); setIsActive(true); }}
          onDragOver={(e) => { e.preventDefault(); setIsActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsActive(false); }}
          onDrop={(e) => {
            e.preventDefault();
            const incoming = Array.from(e.dataTransfer?.files || []);
            if (incoming.length) setFiles([...(files || []), ...incoming]);
            setIsActive(false);
          }}
        >
          <input
            type="file"
            accept=".dcm,application/dicom"
            multiple
            onChange={(e) => {
              const incoming = Array.from(e.target.files || []);
              if (!incoming.length) return;
              setFiles([...(files || []), ...incoming]);
            }}
            className="hidden"
            id="dicom-upload"
          />
          <label htmlFor="dicom-upload" className="cursor-pointer flex flex-col items-center gap-6">
            <div className="w-24 h-24 flex items-center justify-center group-hover:scale-110 smooth-transition">
              <Upload className="w-12 h-12 text-[#9333EA] group-hover:scale-110 smooth-transition" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground mb-1">Click to upload or drag and drop</p>
              <p className="text-sm text-muted-foreground">DICOM files (.dcm) • PHI-safe handling recommended</p>
            </div>
          </label>
        </div>

        {/* Selected files list */}
        {files && files.length > 0 && (
          <div className="space-y-3 animate-fade-in" style={{ animationDelay: '80ms' }}>
            <div className="text-base font-semibold text-foreground">Selected Files ({files.length})</div>
            <div className="space-y-3">
              {files.map((f, idx) => (
                <div
                  key={idx}
                  className="glass-card p-5 flex items-center justify-between group hover:bg-muted/30 hover:shadow-lg smooth-transition"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-[#9333EA]/20 via-[#6366F1]/20 to-[#06B6D4]/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" title={f.name}>{f.name}</p>
                      {typeof f.size === 'number' && (
                        <p className="text-xs text-muted-foreground mt-0.5">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    className="opacity-60 group-hover:opacity-100 smooth-transition hover:bg-destructive/10 hover:text-destructive hover:scale-110"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={onUpload}
            disabled={!files || files.length === 0 || isUploading}
            variant="gradient"
            className="h-12 px-8 gap-2 shadow-md hover:shadow-lg"
          >
            {isUploading ? "Uploading…" : "Upload & Parse Tags"}
          </Button>
          {studyUID && (
            <Button variant="outline" className="h-12" onClick={onReparse}>
              <FileCheck2 className="w-4 h-4 mr-2" />
              Re-parse
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
