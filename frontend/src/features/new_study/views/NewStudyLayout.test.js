import { render, screen } from "@testing-library/react";
import NewStudyLayout from "./NewStudyLayout";

jest.mock("@/features/new_study/components", () => ({
  DuplicateFilesList: () => <div data-testid="duplicate-files-list" />,
  MetadataPreview: () => <div data-testid="metadata-preview" />,
  NewStudyHeader: () => <div data-testid="new-study-header" />,
  UploadDicomCard: () => <div data-testid="upload-dicom-card" />,
}));

function makeViewModel(overrides = {}) {
  return {
    cancelAndGoBack: jest.fn(),
    createStudyAndGoToResults: jest.fn(),
    isCancellingPipeline: false,
    isContinuingToResults: false,
    isDicomUploading: false,
    studyUID: "study-1",
    ...overrides,
  };
}

describe("NewStudyLayout", () => {
  test("keeps the action footer outside the scrollable upload content", () => {
    render(<NewStudyLayout newStudyPageViewModel={makeViewModel()} />);

    const scrollRegion = screen.getByTestId("new-study-scroll-region");
    const actionFooter = screen.getByTestId("new-study-action-footer");

    expect(scrollRegion).toHaveClass("overflow-y-auto");
    expect(actionFooter).not.toBe(scrollRegion);
    expect(actionFooter).toContainElement(screen.getByRole("button", { name: "Continue to Results" }));
    expect(actionFooter).toContainElement(screen.getByRole("button", { name: "Cancel" }));
  });
});
