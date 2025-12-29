import { render } from "@testing-library/react";
import App from "./App";

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

jest.mock("./contexts/AuthenticationContext", () => ({
    AuthProvider: ({ children }) => children,
}));

jest.mock("./contexts/ProtectedRoute", () => () => null);

jest.mock("./pages/Login", () => () => null);
jest.mock("./pages/Dashboard", () => () => null);
jest.mock("./pages/NewStudy", () => () => null);
jest.mock("./pages/StudyResults", () => () => null);

test("renders app shell", () => {
    render(<App />);
    expect(document.body).toBeInTheDocument();
});
