const baseConfig = require('./electron-builder.shared.config');

module.exports = {
  ...baseConfig,
  appId: 'com.horalix.pulse.server',
  productName: 'Horalix Pulse Server',
  directories: {
    ...baseConfig.directories,
    output: 'dist/server',
  },
  extraMetadata: {
    name: 'horalix-pulse-server',
    horalixRuntimeMode: 'server',
  },
  artifactName: 'Horalix-Pulse-Server-${version}-${os}-${arch}.${ext}',
  nsis: {
    ...baseConfig.nsis,
    shortcutName: 'Horalix Pulse Server',
  },
  extraResources: [
    {
      from: 'orthanc',
      to: 'orthanc',
      filter: ['**/*'],
    },
    {
      from: 'horalix_viewer/runtime_config',
      to: 'horalix_viewer/runtime_config',
      filter: ['**/*'],
    },
    {
      from: 'horalix_viewer/Viewers-3.12.0',
      to: 'horalix_viewer/Viewers-3.12.0',
      filter: ['**/*'],
    },
    {
      from: 'backend/dist',
      to: 'backend/dist',
      filter: ['**/*'],
    },
    {
      from: 'backend/app',
      to: 'backend/app',
      filter: ['**/*'],
    },
    {
      from: 'backend/.env',
      to: 'backend/.env',
    },
    {
      from: 'scripts',
      to: 'scripts',
      filter: ['start_llm.ps1', 'stop_llm.ps1', 'server_preflight.ps1'],
    },
    {
      from: 'docker-compose.yml',
      to: 'docker-compose.yml',
    },
    {
      from: 'frontend/public/horalix-tray-icon-256.png',
      to: 'assets/tray.png',
    },
  ],
};
