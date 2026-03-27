module.exports = {
  appId: 'com.horalix.echocardiology',
  productName: 'Echocardiology App',
  directories: {
    output: 'dist',
    buildResources: 'electron/build-resources',
  },
  files: ['dist/electron/**/*', 'frontend/build/**/*', 'package.json'],
  asar: true,
  asarUnpack: ['**/*.node', '**/backend/dist/**/*', '**/backend/app/AI_models/**/*'],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'frontend/public/horalix-taskbar-app-icon-256.ico',
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
    icon: 'electron/build-resources/icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'electron/build-resources/entitlements.mac.plist',
    entitlementsInherit: 'electron/build-resources/entitlements.mac.plist',
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
    icon: 'electron/build-resources/icon.png',
  },
  publish: null,
};
