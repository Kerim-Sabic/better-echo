import { clearDesktopAuthToken } from "./desktopAuth";

export const AUTH_SESSION_EXPIRED_EVENT = "horalix:auth-session-expired";
export const SESSION_HINT_KEY = "authSessionHint";

let authSessionExpiredNotified = false;

export function clearStoredAuthSession() {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Ignore storage failures in browser and Electron runtimes.
  }

  clearDesktopAuthToken();
}

export function persistSessionHint() {
  try {
    localStorage.setItem(SESSION_HINT_KEY, "1");
  } catch {
    // Ignore storage failures in browser and Electron runtimes.
  }

  markAuthSessionActive();
}

export function markAuthSessionActive() {
  authSessionExpiredNotified = false;
}

export function notifyAuthSessionExpired() {
  clearStoredAuthSession();

  if (authSessionExpiredNotified) {
    return;
  }

  authSessionExpiredNotified = true;

  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
}

export function subscribeAuthSessionExpired(handler) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handler);
  return () => {
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handler);
  };
}
