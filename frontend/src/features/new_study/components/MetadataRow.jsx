export default function MetadataRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right text-foreground">{value || "-"}</span>
    </div>
  );
}
