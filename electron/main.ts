import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session } from 'electron';
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
const OPEN_DEVTOOLS_DEFAULT = false;

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
  return { width: 1400, height: 900 };
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
    return path.join(__dirname, '..', '..', 'frontend', 'public', 'lovable-uploads', '9d9bcdf0-8a16-4777-8dc3-85ea7af6f600.png');
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

function createWindow(): void {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

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
  const composeFile = path.join(process.resourcesPath || path.join(__dirname, '..'), 'docker-compose.yml');
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
