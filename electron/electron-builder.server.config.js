const baseConfig = require('./electron-builder.shared.config');

module.exports = {
  ...baseConfig,
  directories: {
    ...baseConfig.directories,
    output: 'dist/server',
  },
  extraMetadata: {
    horalixRuntimeMode: 'server',
  },
  artifactName: 'Echocardiology-App-Server-${version}-${os}-${arch}.${ext}',
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
