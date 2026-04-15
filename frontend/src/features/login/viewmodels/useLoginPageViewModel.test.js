import React from "react";
import { renderHook, waitFor } from "@testing-library/react";

const mockNavigate = jest.fn();
const mockUseElectronRuntimeConfig = jest.fn();
const mockGetAdminSetupStatusApi = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock("@/api/admin", () => ({
  getAdminSetupStatusApi: (...args) => mockGetAdminSetupStatusApi(...args),
}));

jest.mock("@/contexts/AuthenticationContext", () => {
  const ReactModule = require("react");
  return {
    AuthContext: ReactModule.createContext({ setUser: () => {} }),
  };
});

jest.mock("@/lib/webauthn", () => ({
  b64uToBuf: jest.fn(),
  serializePublicKeyCredential: jest.fn(),
}));

jest.mock("@/features/login/model/loginRepository", () => ({
  loginRepository: {
    getBiometricAuthOptions: jest.fn(),
  },
}));

jest.mock("@/features/login/tanstack/mutations/useLoginMutation", () => ({
  useLoginMutation: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
}));

jest.mock("@/features/login/tanstack/mutations/useBiometricLoginMutation", () => ({
  useBiometricLoginMutation: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
}));

jest.mock("@/hooks/useElectronRuntimeConfig", () => ({
  useElectronRuntimeConfig: (...args) => mockUseElectronRuntimeConfig(...args),
}));

import { AuthContext } from "@/contexts/AuthenticationContext";
import {
  getPostLoginRoute,
  useLoginPageViewModel,
} from "./useLoginPageViewModel";

describe("getPostLoginRoute", () => {
  test("routes vendor principals to vendor admin", () => {
    expect(
      getPostLoginRoute({ principalType: "vendor", role: "doctor" }, "server")
    ).toBe("/vendor-admin");
  });

  test("routes admins to server admin in server runtime", () => {
    expect(
      getPostLoginRoute({ principalType: "user", role: "admin" }, "server")
    ).toBe("/server-admin");
  });

  test("routes doctors to dashboard", () => {
    expect(
      getPostLoginRoute({ principalType: "user", role: "doctor" }, "server")
    ).toBe("/dashboard");
  });

  test("routes non-server admins to dashboard", () => {
    expect(
      getPostLoginRoute({ principalType: "user", role: "admin" }, "client")
    ).toBe("/dashboard");
  });
});

describe("useLoginPageViewModel", () => {
  const wrapper = ({ children }) => (
    <AuthContext.Provider value={{ setUser: jest.fn() }}>
      {children}
    </AuthContext.Provider>
  );

  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetAdminSetupStatusApi.mockReset();
    mockUseElectronRuntimeConfig.mockReset();
    mockUseElectronRuntimeConfig.mockReturnValue({
      runtimeConfig: { runtimeMode: "server" },
      openClientRuntimeConfigEditor: jest.fn(),
    });
  });

  test("shows server setup button before bootstrap completes", async () => {
    mockGetAdminSetupStatusApi.mockResolvedValue({ bootstrap_required: true });

    const { result } = renderHook(() => useLoginPageViewModel(), { wrapper });

    await waitFor(() => {
      expect(result.current.canOpenServerAdmin).toBe(true);
    });
  });

  test("hides server setup button after bootstrap completes", async () => {
    mockGetAdminSetupStatusApi.mockResolvedValue({ bootstrap_required: false });

    const { result } = renderHook(() => useLoginPageViewModel(), { wrapper });

    await waitFor(() => {
      expect(result.current.canOpenServerAdmin).toBe(false);
    });
  });

  test("hides server setup button outside server runtime", () => {
    mockUseElectronRuntimeConfig.mockReturnValue({
      runtimeConfig: { runtimeMode: "client" },
      openClientRuntimeConfigEditor: jest.fn(),
    });

    const { result } = renderHook(() => useLoginPageViewModel(), { wrapper });

    expect(result.current.canOpenServerAdmin).toBe(false);
    expect(mockGetAdminSetupStatusApi).not.toHaveBeenCalled();
  });

  test("hides server setup button when setup-status fetch fails", async () => {
    mockGetAdminSetupStatusApi.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useLoginPageViewModel(), { wrapper });

    await waitFor(() => {
      expect(result.current.canOpenServerAdmin).toBe(false);
    });
  });
});
