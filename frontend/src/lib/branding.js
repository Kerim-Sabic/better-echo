import { getStoredTheme } from "@/lib/theme";

const DARK_LOGO_ASSET = "horalix-taskbar-app-icon.png";
const LIGHT_LOGO_ASSET = "horalix-taskbar-app-icon-black.PNG";

export function getRuntimeDisplayName(runtimeMode) {
  return runtimeMode === "server" ? "Horalix Pulse Server" : "Horalix Pulse";
}

function normalizeAssetPath(assetPath) {
  return String(assetPath || "").replace(/^\/+/, "");
}

export function getPublicAssetUrl(assetPath) {
  const normalizedAssetPath = normalizeAssetPath(assetPath);

  if (typeof document !== "undefined" && document.baseURI) {
    try {
      return new URL(normalizedAssetPath, document.baseURI).toString();
    } catch (error) {
      // Fall back to PUBLIC_URL concatenation below.
    }
  }

  const publicUrl = String(process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  return publicUrl ? `${publicUrl}/${normalizedAssetPath}` : normalizedAssetPath;
}

export function resolveLogoAssetName({ theme, forceDark = false } = {}) {
  const normalizedTheme =
    theme === "dark" || forceDark ? "dark" : theme === "light" ? "light" : getStoredTheme();

  return normalizedTheme === "dark" ? DARK_LOGO_ASSET : LIGHT_LOGO_ASSET;
}

export function getThemeAwareLogoUrl(options) {
  return getPublicAssetUrl(resolveLogoAssetName(options));
}
