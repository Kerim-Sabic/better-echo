import { render, screen } from "@testing-library/react";
import ServerAdminPage from "./ServerAdminPage";

const mockUseServerAdminPageViewModel = jest.fn();

jest.mock("react-router-dom", () => ({
  Navigate: ({ to }) => <div data-testid="navigate">{to}</div>,
}), { virtual: true });

jest.mock("@/features/server_admin/viewmodels/useServerAdminPageViewModel", () => ({
  useServerAdminPageViewModel: () => mockUseServerAdminPageViewModel(),
}));

function buildViewModel(overrides = {}) {
  return {
    isRuntimeLoading: false,
    isServerRuntime: true,
    principalType: "user",
    isAdmin: false,
    user: null,
    isPageLoading: false,
    onRefreshPage: jest.fn(),
    onLogout: jest.fn(),
    onGoToLogin: jest.fn(),
    errorMessage: "",
    successMessage: "",
    licenseStatus: { status: "valid", customer_name: "", expires_at: "", license_id: "", features: [] },
    importInputRef: { current: null },
    onImportLicenseFile: jest.fn(),
    isExportingActivationRequest: false,
    onExportActivationRequest: jest.fn(),
    onChooseLicenseFile: jest.fn(),
    isImportingLicense: false,
    bootstrapRequired: false,
    seatUsageLabel: "1 / 5 users used",
    bootstrapForm: { username: "", fullName: "", password: "" },
    onBootstrapSubmit: jest.fn(),
    onBootstrapFieldChange: jest.fn(),
    isBootstrapping: false,
    users: [],
    canManageUsers: false,
    isUserManagementReadOnly: false,
    canMutateUsers: false,
    createForm: { username: "", fullName: "", password: "", role: "doctor" },
    editForm: { userId: null, username: "", fullName: "", password: "", role: "doctor" },
    deletingUserId: null,
    onSelectEditUser: jest.fn(),
    onDeleteUser: jest.fn(),
    onCreateUserSubmit: jest.fn(),
    onCreateFieldChange: jest.fn(),
    isCreatingUser: false,
    onUpdateUserSubmit: jest.fn(),
    onEditFieldChange: jest.fn(),
    onCancelEdit: jest.fn(),
    isUpdatingUser: false,
    ...overrides,
  };
}

describe("ServerAdminPage redirects", () => {
  beforeEach(() => {
    mockUseServerAdminPageViewModel.mockReset();
  });

  test("redirects vendors to vendor admin", () => {
    mockUseServerAdminPageViewModel.mockReturnValue(
      buildViewModel({ principalType: "vendor", user: { principalType: "vendor" } })
    );

    render(<ServerAdminPage />);

    expect(screen.getByTestId("navigate")).toHaveTextContent("/vendor-admin");
  });

  test("redirects authenticated doctors to dashboard", () => {
    mockUseServerAdminPageViewModel.mockReturnValue(
      buildViewModel({
        principalType: "user",
        user: { role: "doctor", principalType: "user" },
        isAdmin: false,
      })
    );

    render(<ServerAdminPage />);

    expect(screen.getByTestId("navigate")).toHaveTextContent("/dashboard");
  });

  test("keeps admins on the server admin page", () => {
    mockUseServerAdminPageViewModel.mockReturnValue(
      buildViewModel({
        principalType: "user",
        user: { role: "admin", principalType: "user" },
        isAdmin: true,
      })
    );

    render(<ServerAdminPage />);

    expect(screen.getByText("Horalix Pulse Server")).toBeInTheDocument();
  });
});

describe("ServerAdminPage license expiry", () => {
  beforeEach(() => {
    mockUseServerAdminPageViewModel.mockReset();
  });

  test("renders valid expiry as local time with UTC detail", () => {
    mockUseServerAdminPageViewModel.mockReturnValue(
      buildViewModel({
        licenseStatus: {
          status: "valid",
          customer_name: "UKC Maribor",
          expires_at: "2026-07-29T22:23:32.739529Z",
          license_id: "pilot-3month",
          features: ["core", "llm"],
        },
      })
    );

    render(<ServerAdminPage />);

    expect(screen.getByText("UTC: 2026-07-29T22:23:32.739529Z")).toBeInTheDocument();
    expect(screen.getByTitle("2026-07-29T22:23:32.739529Z")).toBeInTheDocument();
  });

  test("renders missing expiry as not set", () => {
    mockUseServerAdminPageViewModel.mockReturnValue(
      buildViewModel({
        licenseStatus: { status: "missing", customer_name: "", expires_at: "", license_id: "", features: [] },
      })
    );

    render(<ServerAdminPage />);

    expect(screen.getAllByText("Not set").length).toBeGreaterThan(0);
  });

  test("renders invalid expiry without crashing", () => {
    mockUseServerAdminPageViewModel.mockReturnValue(
      buildViewModel({
        licenseStatus: { status: "invalid", customer_name: "", expires_at: "bad-date", license_id: "", features: [] },
      })
    );

    render(<ServerAdminPage />);

    expect(screen.getByText("bad-date")).toBeInTheDocument();
    expect(screen.getByText("UTC value could not be parsed")).toBeInTheDocument();
  });
});
