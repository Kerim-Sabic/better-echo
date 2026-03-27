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
