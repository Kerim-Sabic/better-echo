const DESKTOP_AUTH_TOKEN_KEY = "desktopAuthToken";
export const DESKTOP_CLIENT_HEADER = "X-Horalix-Desktop-Client";

export function isDesktopAuthRuntime() {
  // True whenever running inside Electron (dev or production). The file:
  // protocol check was removed because in dev mode Electron loads from
  // http://localhost:3000, which made this return false and broke Bearer token
  // auth for remote (cloud) backends where cross-origin cookies don't work.
  return (
    typeof window !== "undefined" &&
    Boolean(window.electronAPI)
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
