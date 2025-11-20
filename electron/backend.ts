import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import axios from 'axios';
import * as path from 'path';

let backendProcess: ChildProcess | null = null;
let backendPort = 8000;

function findAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve) => {
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

    backendPort = await findAvailablePort(8000);
    console.log(`Starting backend on port ${backendPort}`);

    const backendExePathWin = path.join(options.resourcesPath, 'backend', 'dist', 'api', 'api.exe');
    const backendExePathUnix = path.join(options.resourcesPath, 'backend', 'dist', 'api', 'api');
    const exePath = process.platform === 'win32' ? backendExePathWin : backendExePathUnix;

    console.log('Backend executable path:', exePath);
    console.log('Resources path:', options.resourcesPath);

    const env = {
        ...process.env,
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

export function getBackendPort(): number {
    return backendPort;
}
