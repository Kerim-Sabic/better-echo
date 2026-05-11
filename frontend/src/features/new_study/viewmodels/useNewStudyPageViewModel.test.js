import { act, renderHook } from "@testing-library/react";
import {
  DICOM_UPLOAD_LIMIT_EXCEEDED,
  buildDicomUploadLimitMessage,
  useNewStudyPageViewModel,
} from "./useNewStudyPageViewModel";

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("@/features/new_study/tanstack/mutations/useUploadDicomMutation", () => ({
  useUploadDicomMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

jest.mock("@/features/new_study/tanstack/mutations/useStartStudyPipelineMutation", () => ({
  useStartStudyPipelineMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

jest.mock("@/features/new_study/tanstack/mutations/usePromoteStudyPipelineDraftMutation", () => ({
  usePromoteStudyPipelineDraftMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

jest.mock("@/features/new_study/tanstack/mutations/useCancelStudyPipelineMutation", () => ({
  useCancelStudyPipelineMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

jest.mock("@/features/new_study/model/getStudyUIDFromDicomFile", () => ({
  getStudyUIDFromDicomFile: jest.fn(),
}));

function makeFiles(count) {
  return Array.from({ length: count }, (_, index) => new File(["dicom"], `${index}.dcm`));
}

describe("useNewStudyPageViewModel upload limits", () => {
  const originalLimit = process.env.REACT_APP_DICOM_UPLOAD_MAX_FILES;

  afterEach(() => {
    if (originalLimit === undefined) {
      delete process.env.REACT_APP_DICOM_UPLOAD_MAX_FILES;
    } else {
      process.env.REACT_APP_DICOM_UPLOAD_MAX_FILES = originalLimit;
    }
  });

  test("rejects selected files above configured DICOM upload limit", () => {
    process.env.REACT_APP_DICOM_UPLOAD_MAX_FILES = "2";

    const { result } = renderHook(() => useNewStudyPageViewModel());

    act(() => {
      result.current.selectDicomFiles(makeFiles(3));
    });

    expect(result.current.files).toHaveLength(0);
    expect(result.current.status).toContain(DICOM_UPLOAD_LIMIT_EXCEEDED);
    expect(result.current.status).toContain("configured limit is 2");
  });

  test("uses stable upload limit copy", () => {
    expect(buildDicomUploadLimitMessage(31, 30)).toBe(
      "DICOM_UPLOAD_LIMIT_EXCEEDED: 31 DICOM files were selected, but the configured limit is 30. Please retry with a smaller study."
    );
  });
});
