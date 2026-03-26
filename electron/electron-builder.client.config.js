const baseConfig = require('./electron-builder.shared.config');

module.exports = {
  ...baseConfig,
  directories: {
    ...baseConfig.directories,
    output: 'dist/client',
  },
  extraMetadata: {
    horalixRuntimeMode: 'client',
  },
  artifactName: 'Echocardiology-App-Client-${version}-${os}-${arch}.${ext}',
  extraResources: [
    {
      from: 'frontend/public/horalix-tray-icon-256.png',
      to: 'assets/tray.png',
    },
  ],
};
