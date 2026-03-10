export function formatPanechoEchoprimeCombinedResultsDto(rawResponse = {}) {
  const httpStatus = rawResponse?.status ?? null;
  const rawBody = rawResponse?.data ?? null;

  const retryAfterFromResponse = rawResponse?.retryAfter;
  const retryAfter =
    Number.isFinite(retryAfterFromResponse) && retryAfterFromResponse > 0
      ? retryAfterFromResponse
      : null;

  const backendStatus = rawBody?.status ?? null;

  const isPending = httpStatus === 202 && backendStatus === "pending";
  const isComplete = httpStatus === 200 && backendStatus === "complete";
  const isFailed = httpStatus === 200 && backendStatus === "failed";
  const isNotFound = httpStatus === 404;

  let state = "error";
  if (isComplete) state = "ready";
  if (isPending) state = "pending";
  if (isFailed) state = "failed";
  if (isNotFound) state = "not_found";

  return {
    httpStatus,
    backendStatus,
    retryAfter,
    state,
    isPending,
    isComplete,
    isFailed,
    isNotFound,
    panechoEchoprimeResults: isComplete ? rawBody?.panecho_echoprime_results ?? null : null,
    errorDetail: isFailed ? rawBody?.detail ?? "PanEcho + EchoPrime pipeline failed" : null,
    rawResponse,
  };
}
