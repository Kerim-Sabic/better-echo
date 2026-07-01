import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockGetViewerBaseUrl = jest.fn();

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ key: "location-1" }),
}), { virtual: true });

jest.mock("../../../config/api", () => ({
  getViewerBaseUrl: (...args) => mockGetViewerBaseUrl(...args),
}));

import EchocardiographyViewer, {
  VIEWER_REVEAL_DELAY_MS,
  VIEWER_READY_FALLBACK_MS,
} from "./EchocardiographyViewer";

function buildViewModel(overrides = {}) {
  return {
    studyUid: "study-123",
    ohifAiPayload: { studyUid: "study-123" },
    viewerRefreshToken: "token-1",
    studyAnalysisEditorViewModel: {},
    isVendorAccess: false,
    ...overrides,
  };
}

describe("EchocardiographyViewer", () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockGetViewerBaseUrl.mockReset();
    mockGetViewerBaseUrl.mockResolvedValue("http://viewer.local");
  });

  test("shows the skeleton while the viewer is mounted but not yet revealed", async () => {
    render(<EchocardiographyViewer studyResultsPageViewModel={buildViewModel()} />);

    const iframe = await screen.findByTitle("OHIF Viewer");
    const skeleton = screen.getByTestId("viewer-skeleton");

    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass("opacity-100");
    expect(iframe).toHaveClass("opacity-0");
  });

  test("reveals the viewer when the panel-ready message arrives", async () => {
    jest.useFakeTimers();

    render(<EchocardiographyViewer studyResultsPageViewModel={buildViewModel()} />);

    const iframe = await screen.findByTitle("OHIF Viewer");
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: window,
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            channel: "horalix-ai",
            version: 1,
            type: "horalix:panel-ready",
          },
          source: window,
        })
      );
    });

    expect(screen.getByTestId("viewer-skeleton")).toHaveClass("opacity-100");

    act(() => {
      jest.advanceTimersByTime(VIEWER_REVEAL_DELAY_MS);
    });

    await waitFor(() => {
      expect(screen.getByTestId("viewer-skeleton")).toHaveClass("opacity-0");
    });
    expect(iframe).toHaveClass("opacity-100");
  });

  test("resets back to the skeleton when the iframe source changes", async () => {
    jest.useFakeTimers();

    const { rerender } = render(
      <EchocardiographyViewer studyResultsPageViewModel={buildViewModel()} />
    );

    const iframe = await screen.findByTitle("OHIF Viewer");
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: window,
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            channel: "horalix-ai",
            version: 1,
            type: "horalix:panel-ready",
          },
          source: window,
        })
      );
    });

    act(() => {
      jest.advanceTimersByTime(VIEWER_REVEAL_DELAY_MS);
    });

    await waitFor(() => {
      expect(screen.getByTestId("viewer-skeleton")).toHaveClass("opacity-0");
    });

    rerender(
      <EchocardiographyViewer
        studyResultsPageViewModel={buildViewModel({ viewerRefreshToken: "token-2" })}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("viewer-skeleton")).toHaveClass("opacity-100");
    });
  });

  test("does not remount when only the AI payload changes", async () => {
    jest.useFakeTimers();

    const { rerender } = render(
      <EchocardiographyViewer studyResultsPageViewModel={buildViewModel()} />
    );

    const iframe = await screen.findByTitle("OHIF Viewer");
    const initialSrc = iframe.getAttribute("src");
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: window,
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            channel: "horalix-ai",
            version: 1,
            type: "horalix:panel-ready",
          },
          source: window,
        })
      );
    });

    act(() => {
      jest.advanceTimersByTime(VIEWER_REVEAL_DELAY_MS);
    });

    await waitFor(() => {
      expect(screen.getByTestId("viewer-skeleton")).toHaveClass("opacity-0");
    });

    rerender(
      <EchocardiographyViewer
        studyResultsPageViewModel={buildViewModel({
          ohifAiPayload: {
            studyUid: "study-123",
            aiOverlaysState: "ready",
            aiOverlays: [{ overlayType: "lv_segmentation" }],
          },
        })}
      />
    );

    const currentIframe = screen.getByTitle("OHIF Viewer");
    expect(currentIframe).toBe(iframe);
    expect(currentIframe.getAttribute("src")).toBe(initialSrc);
    expect(screen.getByTestId("viewer-skeleton")).toHaveClass("opacity-0");
  });

  test("uses bounded canonical iframe query params", async () => {
    const longRefreshToken = `derived-media-${"very-long-derived-path-".repeat(100)}`;

    render(
      <EchocardiographyViewer
        studyResultsPageViewModel={buildViewModel({
          viewerRefreshToken: longRefreshToken,
        })}
      />
    );

    const iframe = await screen.findByTitle("OHIF Viewer");
    const src = iframe.getAttribute("src");
    const url = new URL(src);
    const configUrl = url.searchParams.get("configUrl");
    const cacheBuster = url.searchParams.get("_cb");

    expect(url.searchParams.get("StudyInstanceUIDs")).toBe("study-123");
    expect(url.searchParams.has("studyInstanceUIDs")).toBe(false);
    expect(url.searchParams.has("url")).toBe(false);
    expect(configUrl).toContain("orthanc-standalone.json");
    expect(cacheBuster).toMatch(/^viewer-/);
    expect(src).not.toContain(longRefreshToken);
    expect(configUrl).not.toContain(longRefreshToken);
    expect(src.length).toBeLessThan(400);
  });

  test("reveals the viewer after iframe load if panel-ready never arrives", async () => {
    jest.useFakeTimers();

    render(<EchocardiographyViewer studyResultsPageViewModel={buildViewModel()} />);

    const iframe = await screen.findByTitle("OHIF Viewer");
    fireEvent.load(iframe);

    expect(screen.getByTestId("viewer-skeleton")).toHaveClass("opacity-100");

    act(() => {
      jest.advanceTimersByTime(VIEWER_READY_FALLBACK_MS);
    });

    await waitFor(() => {
      expect(screen.getByTestId("viewer-skeleton")).toHaveClass("opacity-0");
    });
    expect(iframe).toHaveClass("opacity-100");
  });
});
