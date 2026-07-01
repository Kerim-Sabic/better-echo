import React, { useContext } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { checkAuthApi } from "@/api/authentication";
import {
  markAuthSessionActive,
  notifyAuthSessionExpired,
  SESSION_HINT_KEY,
} from "@/api/authSession";
import { AuthContext, AuthProvider } from "./AuthenticationContext";

jest.mock("@/api/authentication", () => ({
  checkAuthApi: jest.fn(),
  loginApi: jest.fn(),
  logoutApi: jest.fn(),
}));

jest.mock("../config/api", () => ({
  getBackendUrl: jest.fn(() => Promise.resolve("http://localhost:8000")),
}));

function AuthProbe() {
  const auth = useContext(AuthContext);
  window.__authProbe = auth;

  return (
    <>
      <div data-testid="auth-state">
        {auth.user?.username || "none"}:{String(auth.loading)}
      </div>
      <div data-testid="session-expired-notice">
        {String(auth.sessionExpiredNoticeVisible)}
      </div>
    </>
  );
}

function renderAuthProvider(queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("AuthProvider session expiry", () => {
  beforeEach(() => {
    markAuthSessionActive();
    localStorage.clear();
    checkAuthApi.mockReset();
    global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
    delete window.__authProbe;
  });

  afterEach(() => {
    delete window.__authProbe;
  });

  test("clears user, session hint, and query cache on auth expiry event", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["protected"], { value: 1 });
    renderAuthProvider(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none:false");
    });

    act(() => {
      window.__authProbe.setUser({ username: "doctor" });
    });
    localStorage.setItem(SESSION_HINT_KEY, "1");

    expect(screen.getByTestId("auth-state")).toHaveTextContent("doctor:false");

    act(() => {
      notifyAuthSessionExpired();
    });

    expect(screen.getByTestId("auth-state")).toHaveTextContent("none:false");
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    expect(queryClient.getQueryData(["protected"])).toBeUndefined();
    expect(screen.getByTestId("session-expired-notice")).toHaveTextContent("true");
  });

  test("clear session expired notice hides notice state", async () => {
    renderAuthProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none:false");
    });

    act(() => {
      notifyAuthSessionExpired();
    });

    expect(screen.getByTestId("session-expired-notice")).toHaveTextContent("true");

    act(() => {
      window.__authProbe.clearSessionExpiredNotice();
    });

    expect(screen.getByTestId("session-expired-notice")).toHaveTextContent("false");
  });

  test("initial check-auth 401 clears stale session hint", async () => {
    localStorage.setItem(SESSION_HINT_KEY, "1");
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
    checkAuthApi.mockRejectedValue({ response: { status: 401 } });

    renderAuthProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("none:false");
    });

    expect(checkAuthApi).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    expect(screen.getByTestId("session-expired-notice")).toHaveTextContent("false");
  });
});
