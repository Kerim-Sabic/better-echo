import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";

const MESSAGE_CHANNEL = "horalix-ai";
const MESSAGE_VERSION = 1;
const PANEL_READY_TYPE = "horalix:panel-ready";
const AI_RESULTS_TYPE = "horalix:ai-results";

function stripViewerRoute(value) {
  return String(value || "")
    .replace(/\/+$/, "")
    .replace(/\/(viewer-ai|viewer)$/i, "");
}

function normalizeOrigin(value) {
  return String(value || "").replace(/\/+$/, "");
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

function resolveViewerBase(baseUrl, useAiPanel) {
  const root = stripViewerRoute(baseUrl);
  const routeName = useAiPanel ? "viewer-ai" : "viewer";
  return `${root}/${routeName}`;
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function isLocalDev() {
  return process.env.NODE_ENV !== "production";
}

export default function EchocardiographyViewer({
  studyUID,
  aiPayload = null,
  useAiPanel = false,
}) {
  const location = useLocation();
  const iframeRef = useRef(null);
  const iframeLoadedRef = useRef(false);

  const base = String(process.env.REACT_APP_OHIF_BASE_URL || "").replace(/\/+$/, "");
  const hasStudyUID = Boolean(studyUID);
  const hasBase = Boolean(base);

  const viewerRoot = stripViewerRoute(base);
  const viewerBase = resolveViewerBase(base, useAiPanel);
  const targetOrigin = resolvePostMessageOrigin(base);

  const configUrlRaw = String(
    process.env.REACT_APP_OHIF_CONFIG_URL || `${viewerRoot}/orthanc-standalone.json`
  );

  const cacheBuster = `${studyUID || "study"}-${location.key || "location"}`;

  const configUrl = configUrlRaw.includes("?")
    ? `${configUrlRaw}&_cb=${cacheBuster}`
    : `${configUrlRaw}?_cb=${cacheBuster}`;

  const params = new URLSearchParams();
  params.set("configUrl", configUrl);
  params.set("url", configUrl);
  params.set("studyInstanceUIDs", studyUID || "");
  params.set("StudyInstanceUIDs", studyUID || "");
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
    if (!hasStudyUID || !hasBase || !useAiPanel || !isObject(aiPayload)) {
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
      payload: aiPayload,
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
  }, [aiPayload, hasBase, hasStudyUID, targetOrigin, useAiPanel, viewerOrigin]);

  const handleIFrameLoad = useCallback(() => {
    iframeLoadedRef.current = true;
    postAiPayload();
  }, [postAiPayload]);

  useEffect(() => {
    iframeLoadedRef.current = false;
  }, [src]);

  useEffect(() => {
    postAiPayload();
  }, [postAiPayload]);

  useEffect(() => {
    if (!hasStudyUID || !hasBase || !useAiPanel) {
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
        postAiPayload();
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [hasBase, hasStudyUID, postAiPayload, useAiPanel, viewerOrigin]);

  if (!hasStudyUID) {
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
    <iframe
      ref={iframeRef}
      key={`${studyUID}-${location.key}-${cacheBuster}-${useAiPanel ? "viewer-ai" : "viewer"}`}
      title="OHIF Viewer"
      src={src}
      allow="cross-origin-isolated"
      onLoad={handleIFrameLoad}
      className="h-full w-full border-none"
    />
  );
}
