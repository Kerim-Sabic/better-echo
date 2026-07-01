import { render, screen } from "@testing-library/react";
import LoginLayout from "./LoginLayout";

jest.mock("@/features/login/components", () => ({
  AboutHoralixDialog: () => <div>About</div>,
  BiometricLoginButton: () => <div>Bio</div>,
  LoginForm: () => <div>Form</div>,
  LoginHeader: () => <div>Header</div>,
  LoginSessionExpiredNotice: ({ visible }) => visible ? <div>Session expired</div> : null,
}));

function buildLoginPageVM(overrides = {}) {
  return {
    username: "",
    password: "",
    error: "",
    sessionExpiredNoticeVisible: false,
    isLoading: false,
    bioLoading: false,
    setUsername: jest.fn(),
    setPassword: jest.fn(),
    handleSubmit: jest.fn(),
    handleBiometricLogin: jest.fn(),
    canOpenServerAdmin: false,
    onOpenServerAdmin: jest.fn(),
    canReconfigureClientRuntime: false,
    onOpenClientRuntimeConfigEditor: jest.fn(),
    ...overrides,
  };
}

describe("LoginLayout", () => {
  test("renders the server setup button when enabled", () => {
    render(<LoginLayout loginPageVM={buildLoginPageVM({ canOpenServerAdmin: true })} />);

    expect(screen.getByRole("button", { name: "Open Server Setup" })).toBeInTheDocument();
  });

  test("hides the server setup button when disabled", () => {
    render(<LoginLayout loginPageVM={buildLoginPageVM({ canOpenServerAdmin: false })} />);

    expect(screen.queryByRole("button", { name: "Open Server Setup" })).not.toBeInTheDocument();
  });

  test("shows session expired notice when provided by auth state", () => {
    render(<LoginLayout loginPageVM={buildLoginPageVM({ sessionExpiredNoticeVisible: true })} />);

    expect(screen.getByText("Session expired")).toBeInTheDocument();
  });
});
