export default function LoginErrorAlert({ error }) {
  if (!error) {
    return null;
  }

  return (
    <div className="p-3 border border-red-200 rounded-md bg-red-50">
      <p className="text-sm text-red-600">{error}</p>
    </div>
  );
}
