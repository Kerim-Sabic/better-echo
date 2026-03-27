import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/general_components/ui/button";
import BrandLogo from "@/general_components/BrandLogo";

function formatStateLabel(stateValue, isPolling) {
  if (isPolling || stateValue === "pending") {
    return "Processing";
  }

  if (stateValue === "ready") {
    return "Ready";
  }

  if (stateValue === "not_found") {
    return "Not Found";
  }

  if (stateValue === "error" || stateValue === "failed") {
    return "Failed";
  }

  if (stateValue === "loading") {
    return "Loading";
  }

  return "Idle";
}

function statusClasses(stateValue, isPolling) {
  if (isPolling || stateValue === "pending") {
    return "border-amber-300 bg-amber-100 text-amber-800";
  }

  if (stateValue === "ready") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800";
  }

  if (stateValue === "error" || stateValue === "failed") {
    return "border-red-300 bg-red-100 text-red-800";
  }

  return "border-gray-200 bg-white text-gray-700";
}

export default function StudyResultsHeader({ studyResultsPageViewModel }) {
  const {
    studyUid,
    studyResultsState,
    isPolling,
    anyLoading,
    onBack,
    refetchStudyResults,
  } = studyResultsPageViewModel;

  const stateLabel = formatStateLabel(studyResultsState, isPolling);
  const stateClassName = statusClasses(studyResultsState, isPolling);

  return (
    <div className="w-full flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <Button
          variant="ghost"
          onClick={onBack}
          className="gap-2 text-slate-100 hover:scale-105 hover:bg-white/10 hover:text-white fast-transition"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </Button>

        <BrandLogo forceDark className="w-10 h-10" />

        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">Study Results</h1>
          <div className="mt-0.5 pb-1 text-xs text-slate-300">
            UID: <span className="font-medium">{studyUid || "-"}</span>
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 ml-auto">
        <span className={`px-2 py-1 text-xs rounded-full border ${stateClassName}`}>
          {stateLabel}
        </span>

        <Button
          variant="outline"
          onClick={refetchStudyResults}
          className="gap-2 border-white/20 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${anyLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
