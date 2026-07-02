const baseConfig = require('./electron-builder.shared.config');

module.exports = {
  ...baseConfig,
  appId: 'com.horalix.pulse.client',
  productName: 'Horalix Pulse',
  directories: {
    ...baseConfig.directories,
    output: 'dist/client',
  },
  extraMetadata: {
    name: 'horalix-pulse-client',
    horalixRuntimeMode: 'client',
    // Per-tenant builds bake the hospital's server URL into the packaged
    // package.json so the client connects automatically (no setup wizard).
    // runtime.ts reads these (horalixServerBaseUrl/horalixViewerBaseUrl) and
    // treats them as authoritative. Set via:
    //   HORALIX_SERVER_BASE_URL=https://<hospital>.echo.horalix.com npm run dist:client
    //   (or: npm run dist:client:tenant -- <hospital>)
    // Omit the env var for a generic build that shows the setup wizard.
    ...(process.env.HORALIX_SERVER_BASE_URL
      ? {
          horalixServerBaseUrl: process.env.HORALIX_SERVER_BASE_URL,
          horalixViewerBaseUrl:
            process.env.HORALIX_VIEWER_BASE_URL || process.env.HORALIX_SERVER_BASE_URL,
        }
      : {}),
  },
  artifactName: 'Horalix-Pulse-Client-${version}-${os}-${arch}.${ext}',
  nsis: {
    ...baseConfig.nsis,
    shortcutName: 'Horalix Pulse',
  },
  extraResources: [
    {
      from: 'frontend/public/horalix-tray-icon-256.png',
      to: 'assets/tray.png',
    },
  ],
};
