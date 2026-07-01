export default function LoginSessionExpiredNotice({ visible }) {
  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <p className="text-sm font-semibold text-amber-900">Session expired</p>
      <p className="mt-1 text-sm text-amber-800">
        Please log in again to continue.
      </p>
    </div>
  );
}
