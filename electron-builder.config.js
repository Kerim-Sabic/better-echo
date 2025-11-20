module.exports = {
  appId: 'com.horalix.echocardiology',
  productName: 'Echocardiology App',
  directories: {
    output: 'dist',
    buildResources: 'build-resources',
  },
  files: [
    'dist/electron/**/*',
    'frontend/build/**/*',
    'package.json',
  ],
  // Packaged backend executable is placed under resources/backend/dist/api(/api.exe)
  extraResources: [
    {
      from: 'backend/dist',
      to: 'backend/dist',
      filter: ['**/*'],
    },
    {
      from: 'backend/app/AI_models',
      to: 'backend/app/AI_models',
      filter: ['**/*'],
    },
    {
      from: 'backend/app/configs',
      to: 'backend/app/configs',
      filter: ['**/*'],
    },
    {
      from: 'backend/app/prompting',
      to: 'backend/app/prompting',
      filter: ['**/*'],
    },
    {
      from: 'backend/.env',
      to: 'backend/.env',
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
  asar: true,
  asarUnpack: [
    '**/*.node',
    '**/backend/dist/**/*',
    '**/backend/app/AI_models/**/*',
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'frontend/public/horalix-taskbar-app-icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Echocardiology App',
  },
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
    ],
    category: 'public.app-category.medical',
    icon: 'build-resources/icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build-resources/entitlements.mac.plist',
    entitlementsInherit: 'build-resources/entitlements.mac.plist',
  },
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64'],
      },
      {
        target: 'deb',
        arch: ['x64'],
      },
    ],
    category: 'Science',
    icon: 'build-resources/icon.png',
  },
  publish: null,
};
