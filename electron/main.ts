import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, screen } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import axios from 'axios';
import { registerIpcHandlers } from './ipc';

const isDev = process.env.NODE_ENV === 'development';
const REACT_DEV_PORT = 3000;
const BACKEND_DEV_PORT = 8000;
// Toggle to default-open DevTools in development. Flip to true locally if desired.
const OPEN_DEVTOOLS_DEFAULT = true;
// Allow autoplay with audio for splash video first pass
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Orthanc Basic Auth configuration (can override via env vars)
const ORTHANC_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USER = process.env.ORTHANC_USER || 'orthanc';
const ORTHANC_PASS = process.env.ORTHANC_PASS || 'orthanc';
const ORTHANC_URL_OBJ = new URL(ORTHANC_URL);
const ORTHANC_ORIGIN = ORTHANC_URL_OBJ.origin;
const ORTHANC_HOST = ORTHANC_URL_OBJ.hostname;
const ORTHANC_PORT = ORTHANC_URL_OBJ.port ? parseInt(ORTHANC_URL_OBJ.port, 10) : (ORTHANC_URL_OBJ.protocol === 'https:' ? 443 : 80);

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort: number = BACKEND_DEV_PORT;
let tray: Tray | null = null;
let isQuitting = false;
let windowStatePath: string;
// Feature flag: stop Orthanc Docker container on quit (default true in prod)
const STOP_ORTHANC_ON_QUIT: boolean = (
  (process.env.STOP_ORTHANC_ON_QUIT ?? (isDev ? '0' : '1')) === '1'
);

type WindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
};

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function getWindowStatePath(): string {
  const userData = app.getPath('userData');
  return path.join(userData, 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const filePath = getWindowStatePath();
    windowStatePath = filePath;
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as WindowState;
      return {
        width: Math.max(800, data.width || 1400),
        height: Math.max(600, data.height || 900),
        x: data.x,
        y: data.y,
        isMaximized: data.isMaximized || false,
      };
    }
  } catch (e) {
    console.warn('Failed to load window state:', e);
  }
  // Default proportional size (85% of primary display work area)
  try {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return {
      width: Math.max(1280, Math.floor(width * 0.85)),
      height: Math.max(800, Math.floor(height * 0.85)),
    };
  } catch {
    return { width: 1400, height: 900 };
  }
}

function saveWindowState(win: BrowserWindow | null): void {
  if (!win) return;
  const bounds = win.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
  };
  try {
    const filePath = windowStatePath || getWindowStatePath();
    fs.writeFileSync(filePath, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save window state:', e);
  }
}

function getTrayIconPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'frontend', 'public', 'horalix-tray-icon-256.png');
  }
  return path.join(process.resourcesPath || path.join(__dirname, '..'), 'assets', 'tray.png');
}

function createTray(): void {
  const iconPath = getTrayIconPath();
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image);
  tray.setToolTip('Echocardiology App');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Echocardiology App',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

async function waitForBackendHealth(port: number, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(`http://127.0.0.1:${port}/api/health`, {
        timeout: 1000,
      });
      if (response.status === 200) {
        console.log(`Backend health check passed on port ${port}`);
        return true;
      }
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

async function startBackend(): Promise<void> {
  if (isDev) {
    console.log('DEV mode: Assuming backend is running separately on port', BACKEND_DEV_PORT);
    backendPort = BACKEND_DEV_PORT;
    return;
  }

  backendPort = await findAvailablePort(8000);
  console.log(`Starting backend on port ${backendPort}`);

  const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
  const backendExePath = path.join(resourcesPath, 'backend', 'dist', 'api', 'api.exe');
  const backendExePathUnix = path.join(resourcesPath, 'backend', 'dist', 'api', 'api');
  
  const exePath = process.platform === 'win32' ? backendExePath : backendExePathUnix;

  console.log('Backend executable path:', exePath);
  console.log('Resources path:', resourcesPath);

  const env = {
    ...process.env,
    PORT: backendPort.toString(),
    PYTHONUNBUFFERED: '1',
  };

  backendProcess = spawn(exePath, [], {
    env,
    cwd: path.join(resourcesPath, 'backend'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout?.on('data', (data) => {
    console.log('[Backend]', data.toString());
  });

  backendProcess.stderr?.on('data', (data) => {
    console.error('[Backend Error]', data.toString());
  });

  backendProcess.on('error', (error) => {
    console.error('Backend process error:', error);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend process exited with code ${code} and signal ${signal}`);
    backendProcess = null;
  });

  const healthOk = await waitForBackendHealth(backendPort);
  if (!healthOk) {
    throw new Error('Backend failed to start - health check timeout');
  }
}

function stopBackend(): void {
  if (backendProcess) {
    console.log('Stopping backend process');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

const MIN_WIDTH = 1280;
const MIN_HEIGHT = 800;

function createWindow(): void {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: Math.max(MIN_WIDTH, state.width),
    height: Math.max(MIN_HEIGHT, state.height),
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    center: state.x === undefined && state.y === undefined,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#ffffff',
    icon: getTrayIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  // Remove menu across platforms
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    if (state.isMaximized) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${REACT_DEV_PORT}`);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1' || OPEN_DEVTOOLS_DEFAULT) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    const indexPath = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      saveWindowState(mainWindow);
      mainWindow?.hide();
    } else {
      saveWindowState(mainWindow);
    }
  });

  mainWindow.on('resize', () => saveWindowState(mainWindow));
  mainWindow.on('move', () => saveWindowState(mainWindow));

  // Notify renderer of maximize state changes
  mainWindow.on('maximize', () => {
    try { mainWindow?.webContents.send('window:isMaximized-changed', true); } catch {}
  });
  mainWindow.on('unmaximize', () => {
    try { mainWindow?.webContents.send('window:isMaximized-changed', false); } catch {}
  });
}

app.on('ready', async () => {
  try {
    if (!isDev) {
      // Try to start Orthanc via Docker Compose in production
      attemptStartOrthanc().catch((err) => console.warn('Orthanc start warning:', err));
    }
    setupOrthancAuth();
    await startBackend();
    registerIpcHandlers(ipcMain, () => backendPort);
    createTray();
    createWindow();
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Keep running in background (tray) until user quits
  if (isQuitting) {
    stopBackend();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
  // Best-effort: stop Orthanc container via docker compose in production
  if (STOP_ORTHANC_ON_QUIT && !isDev) {
    stopOrthanc().catch((e) => console.warn('Failed to stop Orthanc on quit:', e));
  }
});

process.on('SIGTERM', () => {
  stopBackend();
  app.quit();
});

process.on('SIGINT', () => {
  stopBackend();
  app.quit();
});

function setupOrthancAuth(): void {
  try {
    const basicAuth = 'Basic ' + Buffer.from(`${ORTHANC_USER}:${ORTHANC_PASS}`).toString('base64');
    // Preemptively set Authorization for all requests to Orthanc origin (iframe + assets + XHR)
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [ORTHANC_ORIGIN + '/*'] }, (details, callback) => {
      const headers = details.requestHeaders;
      headers['Authorization'] = basicAuth;
      callback({ requestHeaders: headers });
    });

    // Handle HTTP auth challenge as a fallback
    app.on('login', (event, webContents, request, authInfo, callback) => {
      if (!authInfo.isProxy && authInfo.host === ORTHANC_HOST && authInfo.port === ORTHANC_PORT) {
        event.preventDefault();
        callback(ORTHANC_USER, ORTHANC_PASS);
      }
    });
  } catch (e) {
    console.warn('Failed to set up Orthanc auth interceptors:', e);
  }
}

async function attemptStartOrthanc(): Promise<void> {
  const composeFile = resolveComposeFilePath();
  const haveDocker = await checkDocker();
  if (!haveDocker) {
    console.warn('Docker not found. Skipping Orthanc startup.');
    return;
  }
  // Try docker compose
  try {
    await runCommand('docker', ['compose', '-f', composeFile, 'up', '-d', 'orthanc']);
    console.log('Orthanc started (docker compose).');
    return;
  } catch (e) {
    console.warn('docker compose failed, trying docker-compose...', e);
  }
  // Fallback to docker-compose
  await runCommand('docker-compose', ['-f', composeFile, 'up', '-d', 'orthanc']).then(() => {
    console.log('Orthanc started (docker-compose).');
  }).catch((err) => {
    console.warn('Failed to start Orthanc via docker-compose:', err);
  });
}

function checkDocker(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('docker', ['--version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  });
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve(); else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

function resolveComposeFilePath(): string {
  // Prefer packaged resources path, fall back to project root
  const candidateA = path.join(process.resourcesPath || path.join(__dirname, '..'), 'docker-compose.yml');
  if (fs.existsSync(candidateA)) return candidateA;
  const candidateB = path.join(__dirname, '..', '..', 'docker-compose.yml');
  if (fs.existsSync(candidateB)) return candidateB;
  const candidateC = path.join(process.cwd(), 'docker-compose.yml');
  return candidateC;
}

async function stopOrthanc(): Promise<void> {
  const composeFile = resolveComposeFilePath();
  const haveDocker = await checkDocker();
  if (!haveDocker) {
    console.warn('Docker not found. Cannot stop Orthanc.');
    return;
  }
  // Try docker compose down; fallback to docker-compose; then try stop/rm
  try {
    await runCommand('docker', ['compose', '-f', composeFile, 'down']);
    console.log('Orthanc stopped (docker compose down).');
    return;
  } catch (e) {
    console.warn('docker compose down failed, trying docker-compose down...', e);
  }
  try {
    await runCommand('docker-compose', ['-f', composeFile, 'down']);
    console.log('Orthanc stopped (docker-compose down).');
    return;
  } catch (e) {
    console.warn('docker-compose down failed, trying stop/rm...', e);
  }
  try {
    await runCommand('docker', ['compose', '-f', composeFile, 'stop', 'orthanc']);
    await runCommand('docker', ['compose', '-f', composeFile, 'rm', '-f', 'orthanc']);
    console.log('Orthanc stopped (docker compose stop/rm).');
  } catch (e) {
    try {
      await runCommand('docker-compose', ['-f', composeFile, 'stop', 'orthanc']);
      await runCommand('docker-compose', ['-f', composeFile, 'rm', '-f', 'orthanc']);
      console.log('Orthanc stopped (docker-compose stop/rm).');
    } catch (err) {
      console.warn('Failed to stop Orthanc via docker compose/compose stop/rm:', err);
    }
  }
}

// ----------------- Window control IPC -----------------
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
});
ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});
ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});
