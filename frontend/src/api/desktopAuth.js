const DESKTOP_AUTH_TOKEN_KEY = "desktopAuthToken";
export const DESKTOP_CLIENT_HEADER = "X-Horalix-Desktop-Client";

export function isDesktopAuthRuntime() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.electronAPI) &&
    window.location.protocol === "file:"
  );
}

export function getDesktopAuthToken() {
  if (!isDesktopAuthRuntime()) {
    return "";
  }

  try {
    return localStorage.getItem(DESKTOP_AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function persistDesktopAuthToken(token) {
  if (!isDesktopAuthRuntime()) {
    return;
  }

  try {
    if (token) {
      localStorage.setItem(DESKTOP_AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(DESKTOP_AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore local storage failures in desktop auth fallback mode.
  }
}

export function clearDesktopAuthToken() {
  persistDesktopAuthToken("");
}
