export function isDestroyedViewportError(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message} ${error.stack || ''}`
      : String(error || '');
  const normalized = text.toLowerCase();

  return (
    normalized.includes('viewport has been destroyed') ||
    normalized.includes('no longer usable') ||
    normalized.includes('_throwifdestroyed')
  );
}

export function isElementUsable(
  element: HTMLElement | null | undefined
): element is HTMLElement {
  return Boolean(element && element.isConnected !== false);
}

export function safeViewportCall<T>(callback: () => T, fallback: T): T {
  try {
    return callback();
  } catch (error) {
    if (isDestroyedViewportError(error)) {
      return fallback;
    }

    throw error;
  }
}
