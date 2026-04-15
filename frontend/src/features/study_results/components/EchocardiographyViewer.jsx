import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getViewerBaseUrl } from "../../../config/api";
import {
  buildViewerCacheBuster,
  DYNAMIC_MEASUREMENTS_PENDING_VIEWER_TOKEN,
} from "../model/studyResults.constants";
import Skeleton from "./Skeleton";

const MESSAGE_CHANNEL = "horalix-ai";
const MESSAGE_VERSION = 1;
const PANEL_READY_TYPE = "horalix:panel-ready";
const AI_RESULTS_TYPE = "horalix:ai-results";
const STUDY_ANALYSIS_OVERRIDE_SAVE_TYPE =
  "horalix:study-analysis-override-save";
const STUDY_ANALYSIS_OVERRIDE_CLEAR_TYPE =
  "horalix:study-analysis-override-clear";
const LLM_REPORT_REGENERATE_TYPE = "horalix:llm-report-regenerate";
export const VIEWER_READY_FALLBACK_MS = 2500;
export const VIEWER_REVEAL_DELAY_MS = 500;

function stripViewerRoute(value) {
  return String(value || "")
    .replace(/\/+$/, "")
    .replace(/\/(viewer-ai|viewer)$/i, "");
}

function normalizeOrigin(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolvePostMessageOrigin(baseUrl) {
  const explicitOrigin = process.env.REACT_APP_OHIF_POSTMESSAGE_ORIGIN;
  if (explicitOrigin) {
    return normalizeOrigin(explicitOrigin);
  }

  try {
    return normalizeOrigin(new URL(baseUrl).origin);
  } catch {
    return "";
  }
}

function resolveViewerBase(baseUrl) {
  const root = stripViewerRoute(baseUrl);
  return `${root}/viewer-ai`;
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function isLocalDev() {
  return process.env.NODE_ENV !== "production";
}

function buildViewerIframeKey({ studyUid, locationKey, cacheBuster }) {
  return `${studyUid}-${locationKey}-${cacheBuster}-viewer-ai`;
}

export default function EchocardiographyViewer({ studyResultsPageViewModel }) {
  const {
    studyUid,
    ohifAiPayload,
    viewerRefreshToken,
    studyAnalysisEditorViewModel,
    isVendorAccess,
  } = studyResultsPageViewModel;

  const saveStudyAnalysisOverride =
    studyAnalysisEditorViewModel?.saveStudyAnalysisOverride;
  const clearStudyAnalysisOverride =
    studyAnalysisEditorViewModel?.clearStudyAnalysisOverride;
  const regenerateAiReport = studyAnalysisEditorViewModel?.regenerateAiReport;

  const location = useLocation();
  const iframeRef = useRef(null);
  const iframeLoadedRef = useRef(false);
  const viewerReadyFallbackTimeoutRef = useRef(null);
  const viewerRevealTimeoutRef = useRef(null);
  const [viewerBaseUrl, setViewerBaseUrl] = useState(
    () => String(process.env.REACT_APP_OHIF_BASE_URL || "").replace(/\/+$/, "")
  );
  const [isViewerVisible, setIsViewerVisible] = useState(false);

  const base = viewerBaseUrl;
  const hasStudyUid = Boolean(studyUid);
  const hasBase = Boolean(base);

  const viewerRoot = stripViewerRoute(base);
  const viewerBase = resolveViewerBase(base);
  const targetOrigin = resolvePostMessageOrigin(base);

  const configUrlRaw = String(
    process.env.REACT_APP_OHIF_CONFIG_URL ||
      `${viewerRoot}/orthanc-standalone.json`
  );

  // Derived DICOM outputs are discovered by OHIF on a fresh iframe load, so
  // the iframe key/cache-buster intentionally changes only when those outputs
  // materially change.
  const cacheBuster = buildViewerCacheBuster({
    studyUid,
    locationKey: location.key,
    viewerRefreshToken:
      viewerRefreshToken || DYNAMIC_MEASUREMENTS_PENDING_VIEWER_TOKEN,
  });

  const configUrl = configUrlRaw.includes("?")
    ? `${configUrlRaw}&_cb=${cacheBuster}`
    : `${configUrlRaw}?_cb=${cacheBuster}`;

  const params = new URLSearchParams();
  params.set("configUrl", configUrl);
  params.set("url", configUrl);
  params.set("studyInstanceUIDs", studyUid || "");
  params.set("StudyInstanceUIDs", studyUid || "");
  params.set("_cb", cacheBuster);

  const src = `${viewerBase}?${params.toString()}`;

  const viewerOrigin = useMemo(() => {
    try {
      return normalizeOrigin(new URL(viewerBase).origin);
    } catch {
      return targetOrigin || "";
    }
  }, [targetOrigin, viewerBase]);

  const postAiPayload = useCallback(() => {
    if (!hasStudyUid || !hasBase || !isObject(ohifAiPayload)) {
      return;
    }

    if (!iframeLoadedRef.current) {
      return;
    }

    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) {
      return;
    }

    const message = {
      channel: MESSAGE_CHANNEL,
      type: AI_RESULTS_TYPE,
      version: MESSAGE_VERSION,
      sentAt: new Date().toISOString(),
      payload: ohifAiPayload,
    };

    const strictTargetOrigin = viewerOrigin || targetOrigin || "*";
    const safeTargetOrigin = isLocalDev() ? "*" : strictTargetOrigin;

    try {
      targetWindow.postMessage(message, safeTargetOrigin);
    } catch (error) {
      if (isLocalDev()) {
        return;
      }

      throw error;
    }
  }, [ohifAiPayload, hasBase, hasStudyUid, targetOrigin, viewerOrigin]);

  const clearViewerReadyFallback = useCallback(() => {
    if (viewerReadyFallbackTimeoutRef.current !== null) {
      window.clearTimeout(viewerReadyFallbackTimeoutRef.current);
      viewerReadyFallbackTimeoutRef.current = null;
    }
  }, []);

  const clearViewerRevealDelay = useCallback(() => {
    if (viewerRevealTimeoutRef.current !== null) {
      window.clearTimeout(viewerRevealTimeoutRef.current);
      viewerRevealTimeoutRef.current = null;
    }
  }, []);

  const scheduleViewerReveal = useCallback(() => {
    clearViewerReadyFallback();
    clearViewerRevealDelay();
    viewerRevealTimeoutRef.current = window.setTimeout(() => {
      setIsViewerVisible(true);
      viewerRevealTimeoutRef.current = null;
    }, VIEWER_REVEAL_DELAY_MS);
  }, [clearViewerReadyFallback, clearViewerRevealDelay]);

  const scheduleViewerReadyFallback = useCallback(() => {
    clearViewerReadyFallback();
    viewerReadyFallbackTimeoutRef.current = window.setTimeout(() => {
      clearViewerRevealDelay();
      setIsViewerVisible(true);
      viewerReadyFallbackTimeoutRef.current = null;
    }, VIEWER_READY_FALLBACK_MS);
  }, [clearViewerReadyFallback, clearViewerRevealDelay]);

  const handleStudyAnalysisOverrideSaveIntent = useCallback(
    async payload => {
      if (typeof saveStudyAnalysisOverride !== "function" || !studyUid) {
        return;
      }

      const payloadStudyUid = normalizeText(payload?.studyUid);
      const measurementKey = normalizeText(payload?.key);
      const override = isObject(payload?.override) ? payload.override : null;

      if (payloadStudyUid && payloadStudyUid !== studyUid) {
        return;
      }

      if (!measurementKey || !override) {
        return;
      }

      try {
        await saveStudyAnalysisOverride(measurementKey, override);
      } catch (error) {
        console.error(
          "[EchocardiographyViewer] Failed to save study-analysis override",
          error
        );
      }
    },
    [saveStudyAnalysisOverride, studyUid]
  );

  const handleStudyAnalysisOverrideClearIntent = useCallback(
    async payload => {
      if (typeof clearStudyAnalysisOverride !== "function" || !studyUid) {
        return;
      }

      const payloadStudyUid = normalizeText(payload?.studyUid);
      const measurementKey = normalizeText(payload?.key);

      if (payloadStudyUid && payloadStudyUid !== studyUid) {
        return;
      }

      if (!measurementKey) {
        return;
      }

      try {
        await clearStudyAnalysisOverride(measurementKey);
      } catch (error) {
        console.error(
          "[EchocardiographyViewer] Failed to clear study-analysis override",
          error
        );
      }
    },
    [clearStudyAnalysisOverride, studyUid]
  );

  const handleRegenerateLlmReportIntent = useCallback(
    async payload => {
      if (typeof regenerateAiReport !== "function" || !studyUid) {
        return;
      }

      const payloadStudyUid = normalizeText(payload?.studyUid);

      if (payloadStudyUid && payloadStudyUid !== studyUid) {
        return;
      }

      try {
        await regenerateAiReport();
      } catch (error) {
        console.error(
          "[EchocardiographyViewer] Failed to regenerate AI Report",
          error
        );
      }
    },
    [regenerateAiReport, studyUid]
  );

  const handleIFrameLoad = useCallback(() => {
    iframeLoadedRef.current = true;
    postAiPayload();
    scheduleViewerReadyFallback();
  }, [postAiPayload, scheduleViewerReadyFallback]);

  useEffect(() => {
    let isActive = true;

    getViewerBaseUrl()
      .then(resolvedBaseUrl => {
        if (isActive) {
          setViewerBaseUrl(String(resolvedBaseUrl || "").replace(/\/+$/, ""));
        }
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    iframeLoadedRef.current = false;
    setIsViewerVisible(false);
    clearViewerReadyFallback();
    clearViewerRevealDelay();
  }, [clearViewerReadyFallback, clearViewerRevealDelay, src]);

  useEffect(() => {
    return () => {
      clearViewerReadyFallback();
      clearViewerRevealDelay();
    };
  }, [clearViewerReadyFallback, clearViewerRevealDelay]);

  useEffect(() => {
    postAiPayload();
  }, [postAiPayload]);

  useEffect(() => {
    if (!hasStudyUid || !hasBase) {
      return undefined;
    }

    const onMessage = event => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) {
        return;
      }

      if (!isLocalDev()) {
        const normalizedEventOrigin = normalizeOrigin(event.origin);
        if (viewerOrigin && normalizedEventOrigin !== viewerOrigin) {
          return;
        }
      }

      const data = event.data;
      if (!isObject(data)) {
        return;
      }

      if (data.channel !== MESSAGE_CHANNEL || data.version !== MESSAGE_VERSION) {
        return;
      }

      if (data.type === PANEL_READY_TYPE) {
        scheduleViewerReveal();
        postAiPayload();
        return;
      }

      if (!isObject(data.payload)) {
        return;
      }

      if (data.type === STUDY_ANALYSIS_OVERRIDE_SAVE_TYPE) {
        if (isVendorAccess) {
          return;
        }
        void handleStudyAnalysisOverrideSaveIntent(data.payload);
        return;
      }

      if (data.type === STUDY_ANALYSIS_OVERRIDE_CLEAR_TYPE) {
        if (isVendorAccess) {
          return;
        }
        void handleStudyAnalysisOverrideClearIntent(data.payload);
        return;
      }

      if (data.type === LLM_REPORT_REGENERATE_TYPE) {
        if (isVendorAccess) {
          return;
        }
        void handleRegenerateLlmReportIntent(data.payload);
      }
    };

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [
    handleStudyAnalysisOverrideClearIntent,
    handleStudyAnalysisOverrideSaveIntent,
    handleRegenerateLlmReportIntent,
    hasBase,
    hasStudyUid,
    isVendorAccess,
    postAiPayload,
    scheduleViewerReveal,
    viewerOrigin,
  ]);

  if (!hasStudyUid) {
    return null;
  }

  if (!hasBase) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/80">
        OHIF base URL is not configured.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <Skeleton isVisible={!isViewerVisible} />
      <iframe
        ref={iframeRef}
        key={buildViewerIframeKey({
          studyUid,
          locationKey: location.key,
          cacheBuster,
        })}
        title="OHIF Viewer"
        src={src}
        allow="cross-origin-isolated"
        onLoad={handleIFrameLoad}
        className={`h-full w-full border-none transition-opacity duration-300 ${
          isViewerVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
    </div>
  );
}
