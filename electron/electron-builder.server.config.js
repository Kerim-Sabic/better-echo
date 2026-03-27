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
      from: 'backend/desktop/generated_runtime.env',
      to: 'backend/.env',
    },
    {
      from: 'backend/app/AI_models/PanEcho/hubconf.py',
      to: 'backend/runtime_assets/models/primary_analysis/hubconf.py',
    },
    {
      from: 'backend/app/AI_models/PanEcho/content/tasks.pkl',
      to: 'backend/runtime_assets/models/primary_analysis/content/tasks.pkl',
    },
    {
      from: 'backend/app/AI_models/PanEcho/weights/panecho.pt',
      to: 'backend/runtime_assets/models/primary_analysis/weights/model.pt',
    },
    {
      from: 'backend/app/AI_models/PanEcho/src/models.py',
      to: 'backend/runtime_assets/models/primary_analysis/src/models.py',
    },
    {
      from: 'backend/app/AI_models/EchoPrime/assets',
      to: 'backend/runtime_assets/models/secondary_analysis/assets',
      filter: [
        'all_phr.json',
        'MIL_weights.csv',
        'per_section.json',
        'section_to_phenotypes.pkl',
      ],
    },
    {
      from: 'backend/app/AI_models/EchoPrime/model_data/candidates_data',
      to: 'backend/runtime_assets/models/secondary_analysis/model_data/candidates_data',
      filter: [
        'candidate_embeddings_p1.pt',
        'candidate_embeddings_p2.pt',
        'candidate_labels.pkl',
        'candidate_studies.csv',
      ],
    },
    {
      from: 'backend/app/AI_models/EchoPrime/model_data/weights/echo_prime_encoder.pt',
      to: 'backend/runtime_assets/models/secondary_analysis/model_data/weights/analysis_encoder.pt',
    },
    {
      from: 'backend/app/AI_models/EchoPrime/model_data/weights/view_classifier.pt',
      to: 'backend/runtime_assets/models/secondary_analysis/model_data/weights/view_classifier.pt',
    },
    {
      from: 'backend/app/AI_models/measurements/weights',
      to: 'backend/runtime_assets/models/study_measurements/weights',
      filter: ['**/*'],
    },
    {
      from: 'backend/app/AI_models/EchonetDynamic/output/segmentation/deeplabv3_resnet50_random/best.pt',
      to: 'backend/runtime_assets/models/motion_segmentation/best.pt',
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
