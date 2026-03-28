import { render } from "@testing-library/react";
import App from "../../App";

jest.mock(
  "react-router-dom",
  () => ({
    BrowserRouter: ({ children }) => <div data-testid="router">{children}</div>,
    Routes: ({ children }) => <div>{children}</div>,
    Route: ({ element }) => <div>{element}</div>,
    Navigate: () => null,
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: "/dashboard" }),
  }),
  { virtual: true }
);

jest.mock("../../contexts/AuthenticationContext", () => ({
  AuthProvider: ({ children }) => children,
}));

jest.mock("../../contexts/ProtectedRoute", () => () => null);

jest.mock("@/features/login/views/LoginPage", () => () => null);
jest.mock("@/features/dashboard/views/DashboardPage", () => () => null);
jest.mock("@/features/new_study/views/NewStudyPage", () => () => null);
jest.mock("@/features/study_results/views/StudyResultsPage", () => () => null);

test("renders app shell", () => {
  render(<App />);
  expect(document.body).toBeInTheDocument();
});
