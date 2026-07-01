import { apiClient } from "./client";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  markAuthSessionActive,
} from "./authSession";

function rejectWithUnauthorized(config) {
  return Promise.reject({
    config,
    response: {
      status: 401,
      config,
    },
  });
}

function resolveOk(captureConfig) {
  return config => {
    captureConfig(config);
    return Promise.resolve({
      data: { ok: true },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });
  };
}

function headerValue(headers, key) {
  if (typeof headers?.get === "function") {
    return headers.get(key);
  }

  return headers?.[key];
}

describe("apiClient auth expiry handling", () => {
  const originalAdapter = apiClient.defaults.adapter;

  beforeEach(() => {
    markAuthSessionActive();
    localStorage.clear();
    apiClient.defaults.adapter = originalAdapter;
    delete window.electronAPI;
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    delete window.electronAPI;
  });

  test("emits auth expiry event on protected endpoint 401", async () => {
    const onExpired = jest.fn();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    apiClient.defaults.adapter = rejectWithUnauthorized;

    await expect(apiClient.get("/studies")).rejects.toBeTruthy();

    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
  });

  test("does not emit auth expiry event for login 401", async () => {
    const onExpired = jest.fn();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    apiClient.defaults.adapter = rejectWithUnauthorized;

    await expect(apiClient.post("/login", {})).rejects.toBeTruthy();

    expect(onExpired).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
  });

  test("clears desktop bearer token after protected endpoint 401", async () => {
    Object.defineProperty(window, "electronAPI", {
      value: {},
      configurable: true,
    });
    localStorage.setItem("desktopAuthToken", "expired-token");
    apiClient.defaults.adapter = rejectWithUnauthorized;

    await expect(apiClient.get("/studies")).rejects.toBeTruthy();

    expect(localStorage.getItem("desktopAuthToken")).toBeNull();

    let capturedConfig = null;
    apiClient.defaults.adapter = resolveOk(config => {
      capturedConfig = config;
    });

    await apiClient.get("/studies");

    expect(headerValue(capturedConfig.headers, "Authorization")).toBeFalsy();
  });
});
