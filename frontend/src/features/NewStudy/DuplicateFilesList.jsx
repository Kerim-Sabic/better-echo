import React from "react";

export function DuplicateFilesList({ files }) {
  if (!files || files.length === 0) return null;

  return (
    <div className="duplicate-files-card">
        <p className="text-sm text-muted-foreground">
            <span className="font-medium" >Files already uploaded from before:</span>
            <ul>
                {files.map((name, idx) => (
                <li key={idx}>{name}</li>
                ))}
            </ul>
        </p>
    </div>
  );
}
