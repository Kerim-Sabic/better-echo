import { STUDY_RESULTS_CHROME_BG } from "@/features/study_results/model/studyResults.theme";

export default function Skeleton({ isVisible = true }) {
  return (
    <div
      data-testid="viewer-skeleton"
      aria-hidden={!isVisible}
      className={`absolute inset-0 z-10 overflow-hidden transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ backgroundColor: STUDY_RESULTS_CHROME_BG }}
    >
      <div className="flex h-full">
        <div className="flex w-16 flex-col items-center gap-3 border-r border-white/10 bg-black/20 px-3 py-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-8 w-8 animate-pulse rounded-lg bg-white/10"
            />
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 items-center gap-3 border-b border-white/10 px-4">
            <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
            <div className="h-3 w-20 animate-pulse rounded-full bg-white/10" />
            <div className="ml-auto h-3 w-16 animate-pulse rounded-full bg-white/10" />
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="relative flex-1 bg-black">
              <div className="absolute inset-6 rounded-2xl border border-white/10 bg-white/[0.03]">
                <div className="absolute inset-x-6 top-6 h-3 animate-pulse rounded-full bg-white/10" />
                <div className="absolute left-6 top-16 h-24 w-24 animate-pulse rounded-2xl bg-white/[0.06]" />
                <div className="absolute right-6 top-16 h-16 w-32 animate-pulse rounded-2xl bg-white/[0.06]" />
              </div>
            </div>

            <div
              className="hidden w-72 border-l border-white/10 p-4 lg:flex lg:flex-col lg:gap-4"
              style={{ backgroundColor: STUDY_RESULTS_CHROME_BG }}
            >
              <div className="h-4 w-32 animate-pulse rounded-full bg-white/10" />
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
                  <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-white/[0.08]" />
                  <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-white/[0.08]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
