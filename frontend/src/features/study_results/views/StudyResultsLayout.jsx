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

      <main className="flex-1 pt-16">
        <EchocardiographyViewer studyResultsPageViewModel={studyResultsPageViewModel} />
      </main>
    </div>
  );
}
