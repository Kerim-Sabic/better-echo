import { fireEvent, render, screen } from "@testing-library/react";
import UploadDicomCard from "./UploadDicomCard";

function makeFile(name, size = 1024) {
  return new File(["dicom"], name, { type: "application/dicom", lastModified: size });
}

function makeViewModel(overrides = {}) {
  const files = [
    makeFile("apical-four-chamber.dcm", 1024),
    makeFile("parasternal-long-axis.dcm", 2048),
    makeFile("spectral-doppler.dcm", 4096),
  ];

  return {
    dicomUploadMaxFiles: 30,
    files,
    handleUpload: jest.fn(),
    isDicomUploading: false,
    selectDicomFiles: jest.fn(),
    setFiles: jest.fn(),
    ...overrides,
  };
}

describe("UploadDicomCard", () => {
  test("renders selected files in a compact responsive grid", () => {
    render(<UploadDicomCard newStudyPageViewModel={makeViewModel()} />);

    expect(screen.getByText("Selected Files (3)")).toBeInTheDocument();
    expect(screen.getByText("apical-four-chamber.dcm")).toBeInTheDocument();
    expect(screen.getByText("parasternal-long-axis.dcm")).toBeInTheDocument();
    expect(screen.getByText("spectral-doppler.dcm")).toBeInTheDocument();
    expect(screen.getByTestId("selected-files-grid")).toHaveClass(
      "grid",
      "sm:grid-cols-2",
      "lg:grid-cols-3",
      "xl:grid-cols-4"
    );
  });

  test("removes the selected file without changing upload behavior", () => {
    const viewModel = makeViewModel();

    render(<UploadDicomCard newStudyPageViewModel={viewModel} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove apical-four-chamber.dcm" }));

    expect(viewModel.setFiles).toHaveBeenCalledWith([
      viewModel.files[1],
      viewModel.files[2],
    ]);
  });
});
