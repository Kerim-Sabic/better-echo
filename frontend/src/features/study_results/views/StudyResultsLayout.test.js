import { render, screen } from "@testing-library/react";
import StudyResultsLayout from "./StudyResultsLayout";
import { STUDY_RESULTS_CHROME_BG } from "@/features/study_results/model/studyResults.theme";

const mockApplyTheme = jest.fn();

jest.mock("@/features/study_results/components", () => ({
  StudyResultsHeader: () => <div>Study Header</div>,
  EchocardiographyViewer: () => <div>Viewer</div>,
}));

jest.mock("@/lib/theme", () => ({
  applyTheme: (...args) => mockApplyTheme(...args),
}));

describe("StudyResultsLayout", () => {
  beforeEach(() => {
    mockApplyTheme.mockReset();
    document.documentElement.setAttribute("data-theme", "light");
  });

  test("uses the shared chrome color on the fixed header", () => {
    const viewModel = { studyUid: "study-123" };
    const { container } = render(
      <StudyResultsLayout studyResultsPageViewModel={viewModel} />
    );

    expect(screen.getByText("Study Header")).toBeInTheDocument();
    expect(container.querySelector("header")).toHaveStyle(
      `background-color: ${STUDY_RESULTS_CHROME_BG}`
    );
  });

  test("renders memory failure notice when provided", () => {
    const viewModel = {
      studyUid: "study-123",
      failureNotice: {
        title: "Study is too large for available memory",
        message: "Please retry with a smaller study.",
      },
    };

    render(<StudyResultsLayout studyResultsPageViewModel={viewModel} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Study is too large");
    expect(screen.getByRole("alert")).toHaveTextContent("smaller study");
  });
});
