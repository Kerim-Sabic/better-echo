import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import axios from 'axios';
import * as path from 'path';

let backendProcess: ChildProcess | null = null;
let backendPort: number | null = null;

const DEFAULT_PACKAGED_BACKEND_HOST = '0.0.0.0';
const DEFAULT_PACKAGED_BACKEND_PORT = 8000;

function resolvePackagedBackendHost(env: NodeJS.ProcessEnv): string {
    const configuredHost = String(env.BACKEND_HOST || '').trim();
    return configuredHost || DEFAULT_PACKAGED_BACKEND_HOST;
}

function resolvePackagedBackendPort(env: NodeJS.ProcessEnv): number {
    const rawPort = String(env.BACKEND_PORT || env.PORT || DEFAULT_PACKAGED_BACKEND_PORT).trim();
    const parsedPort = Number.parseInt(rawPort, 10);

    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
        throw new Error(`Invalid BACKEND_PORT value: ${rawPort}`);
    }

    return parsedPort;
}

function ensurePortAvailable(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', (error: NodeJS.ErrnoException) => {
            server.close();
            if (error.code === 'EADDRINUSE') {
                reject(new Error(`Configured backend port ${port} is already in use for host ${host}`));
                return;
            }

            reject(error);
        });

        server.listen(port, host, () => {
            server.close((closeError) => {
                if (closeError) {
                    reject(closeError);
                    return;
                }

                resolve();
            });
        });
    });
}

async function waitForBackendHealth(port: number, maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await axios.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1000 });
            if (response.status === 200) {
                console.log(`Backend health check passed on port ${port}`);
                return true;
            }
        } catch {
            // wait and retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return false;
}

export async function startBackend(options: { isDev: boolean; devPort: number; resourcesPath: string }): Promise<number> {
  if (options.isDev) {
    console.log('DEV mode: Assuming backend is running separately on port', options.devPort);
        backendPort = options.devPort;
        return backendPort;
    }

    const backendHost = resolvePackagedBackendHost(process.env);
    backendPort = resolvePackagedBackendPort(process.env);
    await ensurePortAvailable(backendHost, backendPort);
    console.log(`Starting backend on ${backendHost}:${backendPort}`);

    const backendExePathWin = path.join(options.resourcesPath, 'backend', 'dist', 'api', 'api.exe');
    const backendExePathUnix = path.join(options.resourcesPath, 'backend', 'dist', 'api', 'api');
    const exePath = process.platform === 'win32' ? backendExePathWin : backendExePathUnix;

    console.log('Backend executable path:', exePath);
    console.log('Resources path:', options.resourcesPath);

    const env = {
        ...process.env,
        BACKEND_HOST: backendHost,
        BACKEND_PORT: backendPort.toString(),
        PORT: backendPort.toString(),
        PYTHONUNBUFFERED: '1',
    };

    backendProcess = spawn(exePath, [], {
        env,
        cwd: path.join(options.resourcesPath, 'backend'),
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

    return backendPort;
}

export function stopBackend(): void {
  if (backendProcess) {
    console.log('Stopping backend process');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

export function getBackendPort(): number | null {
  return backendPort;
}
