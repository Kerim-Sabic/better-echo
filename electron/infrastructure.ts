import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';

const DEFAULT_POSTGRES_PORT = 5433;
const INFRA_SERVICE_NAMES = ['postgres', 'orthanc', 'horalix-viewer'] as const;
const INFRA_START_TIMEOUT_ATTEMPTS = 60;
const INFRA_RETRY_DELAY_MS = 1000;

export type ManagedInfrastructureConfig = {
  postgresPort?: number;
  orthancUrl: string;
  viewerUrl: string;
};

export async function startManagedInfrastructure(config: ManagedInfrastructureConfig): Promise<void> {
  const composeFile = resolveComposeFilePath();
  await ensureDockerAvailable();

  // Rebuild the viewer image so packaged source-level viewer changes are not masked
  // by a stale cached horalix-viewer Docker image from an older app build.
  await runComposeCommand(composeFile, ['build', 'horalix-viewer']);
  await runComposeCommand(composeFile, ['up', '-d', ...INFRA_SERVICE_NAMES]);

  await waitForTcpPort('127.0.0.1', config.postgresPort || DEFAULT_POSTGRES_PORT, 'PostgreSQL');
  await waitForTcpPort(...getHostAndPort(config.orthancUrl, 'Orthanc'));
  await waitForHttpReady(config.viewerUrl, 'OHIF viewer');
}

export async function stopManagedInfrastructure(): Promise<void> {
  const composeFile = resolveComposeFilePath();
  await ensureDockerAvailable();
  await runComposeCommand(composeFile, ['down']);
}

function resolveComposeFilePath(): string {
  const candidateA = path.join(process.resourcesPath || path.join(__dirname, '..'), 'docker-compose.yml');
  if (fs.existsSync(candidateA)) return candidateA;

  const candidateB = path.join(__dirname, '..', '..', 'docker-compose.yml');
  if (fs.existsSync(candidateB)) return candidateB;

  return path.join(process.cwd(), 'docker-compose.yml');
}

async function ensureDockerAvailable(): Promise<void> {
  if (await checkDocker()) {
    return;
  }

  throw new Error('Docker is required for packaged server mode but was not found on PATH.');
}

function checkDocker(): Promise<boolean> {
  return new Promise((resolve) => {
    const processRef = spawn('docker', ['--version'], { stdio: 'ignore' });
    processRef.on('error', () => resolve(false));
    processRef.on('exit', (code) => resolve(code === 0));
  });
}

async function runComposeCommand(composeFile: string, args: string[]): Promise<void> {
  try {
    await runCommand('docker', ['compose', '-f', composeFile, ...args]);
    return;
  } catch (dockerComposeError) {
    try {
      await runCommand('docker-compose', ['-f', composeFile, ...args]);
      return;
    } catch (dockerComposeLegacyError) {
      throw new Error(
        `Failed to run Docker Compose for ${args.join(' ')}.\n` +
        `docker compose: ${String(dockerComposeError)}\n` +
        `docker-compose: ${String(dockerComposeLegacyError)}`
      );
    }
  }
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const processRef = spawn(command, args, { stdio: 'ignore' });
    processRef.on('error', reject);
    processRef.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function getHostAndPort(urlValue: string, label: string): [string, number, string] {
  const parsedUrl = new URL(urlValue);
  const port = parsedUrl.port
    ? parseInt(parsedUrl.port, 10)
    : (parsedUrl.protocol === 'https:' ? 443 : 80);

  return [parsedUrl.hostname, port, label];
}

async function waitForTcpPort(host: string, port: number, label: string): Promise<void> {
  for (let attempt = 0; attempt < INFRA_START_TIMEOUT_ATTEMPTS; attempt += 1) {
    if (await canConnect(host, port)) {
      return;
    }

    await delay(INFRA_RETRY_DELAY_MS);
  }

  throw new Error(`${label} did not become reachable on ${host}:${port}.`);
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForHttpReady(urlValue: string, label: string): Promise<void> {
  for (let attempt = 0; attempt < INFRA_START_TIMEOUT_ATTEMPTS; attempt += 1) {
    try {
      const response = await axios.get(urlValue, { timeout: 2000 });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // Keep retrying until timeout.
    }

    await delay(INFRA_RETRY_DELAY_MS);
  }

  throw new Error(`${label} did not become ready at ${urlValue}.`);
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
