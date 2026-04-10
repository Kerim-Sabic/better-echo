import { getStoredTheme } from "@/lib/theme";

const DARK_LOGO_ASSET = "horalix-taskbar-app-icon.png";
const LIGHT_LOGO_ASSET = "horalix-taskbar-app-icon-black.PNG";

export function getRuntimeDisplayName(runtimeMode) {
  return runtimeMode === "server" ? "Horalix Pulse Server" : "Horalix Pulse";
}

function normalizeAssetPath(assetPath) {
  return String(assetPath || "").replace(/^\/+/, "");
}

function isAbsoluteAssetUrl(assetPath) {
  return /^(?:[a-z]+:|\/\/)/i.test(String(assetPath || ""));
}

function getRuntimePublicBase() {
  const publicBase = String(process.env.PUBLIC_URL || "").replace(/\/+$/, "");

  if (publicBase === ".") {
    return ".";
  }

  if (publicBase) {
    return publicBase;
  }

  if (typeof window === "undefined") {
    return "";
  }

  if (window.location.protocol === "file:") {
    return ".";
  }

  return String(window.location.origin || "").replace(/\/+$/, "");
}

export function getPublicAssetUrl(assetPath) {
  if (isAbsoluteAssetUrl(assetPath)) {
    return String(assetPath);
  }

  const normalizedAssetPath = normalizeAssetPath(assetPath);
  const publicBase = getRuntimePublicBase();

  if (publicBase === ".") {
    return `./${normalizedAssetPath}`;
  }

  if (publicBase) {
    return `${publicBase}/${normalizedAssetPath}`;
  }

  return `/${normalizedAssetPath}`;
}

export function resolveLogoAssetName({ theme, forceDark = false } = {}) {
  const normalizedTheme =
    theme === "dark" || forceDark ? "dark" : theme === "light" ? "light" : getStoredTheme();

  return normalizedTheme === "dark" ? DARK_LOGO_ASSET : LIGHT_LOGO_ASSET;
}

export function getThemeAwareLogoUrl(options) {
  return getPublicAssetUrl(resolveLogoAssetName(options));
}
