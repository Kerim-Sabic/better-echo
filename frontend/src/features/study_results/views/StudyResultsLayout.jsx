import { useEffect } from "react";
import { TITLEBAR_HEIGHT } from "@/general_components/TitleBar";
import { StudyResultsHeader, EchocardiographyViewer } from "@/features/study_results/components";
import { STUDY_RESULTS_CHROME_BG } from "@/features/study_results/model/studyResults.theme";
import { applyTheme } from "@/lib/theme";

export default function StudyResultsLayout({ studyResultsPageViewModel }) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const previousTheme = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme("dark");

    return () => {
      applyTheme(previousTheme);
    };
  }, []);

  if (!studyResultsPageViewModel.studyUid) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-gray-600">
        No study selected.
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden bg-black"
      style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}
    >
      <header
        className="fixed left-0 right-0 z-50 h-16 border-b border-white/20"
        style={{ top: TITLEBAR_HEIGHT, backgroundColor: STUDY_RESULTS_CHROME_BG }}
      >
        <div className="h-full px-6 flex items-center">
          <StudyResultsHeader studyResultsPageViewModel={studyResultsPageViewModel} />
        </div>
      </header>

      {studyResultsPageViewModel.failureNotice ? (
        <div
          role="alert"
          className="fixed left-6 right-6 z-40 rounded-2xl border border-amber-300/40 bg-amber-950/95 px-4 py-3 text-amber-50 shadow-2xl"
          style={{ top: `calc(${TITLEBAR_HEIGHT}px + 4.75rem)` }}
        >
          <div className="text-sm font-semibold">{studyResultsPageViewModel.failureNotice.title}</div>
          <div className="mt-1 text-xs text-amber-100">{studyResultsPageViewModel.failureNotice.message}</div>
        </div>
      ) : null}

      <main className="flex-1 pt-16">
        <EchocardiographyViewer studyResultsPageViewModel={studyResultsPageViewModel} />
      </main>
    </div>
  );
}
