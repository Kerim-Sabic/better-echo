export function DuplicateFilesList({ newStudyPageViewModel }) {
  const { duplicatesFiles } = newStudyPageViewModel;

  if (!duplicatesFiles || duplicatesFiles.length === 0) {
    return null;
  }

  return (
    <div className="glass-card p-5 rounded-xl">
      <div className="text-base font-semibold text-foreground mb-2">Duplicate Files</div>

      <p className="text-sm text-muted-foreground mb-2">Files already uploaded from before:</p>

      <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
        {duplicatesFiles.map((fileName, index) => (
          <li key={index} className="break-words">
            {fileName}
          </li>
        ))}
      </ul>
    </div>
  );
}
