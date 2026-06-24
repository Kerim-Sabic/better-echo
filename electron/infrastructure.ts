import axios from 'axios';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { app } from 'electron';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';

const DEFAULT_POSTGRES_PORT = 5433;
const INFRA_SERVICE_NAMES = ['postgres', 'orthanc', 'horalix-viewer'] as const;
const INFRA_START_TIMEOUT_ATTEMPTS = 60;
const INFRA_RETRY_DELAY_MS = 1000;
const VIEWER_IMAGE_NAME = 'horalix-viewer:local-dev';
const VIEWER_BUILD_STAMP_FILE = 'viewer-build-stamp.json';
const CONTAINER_NAMES = {
  postgres: 'horalix_postgres',
  orthanc: 'orthanc',
  viewer: 'horalix-viewer',
} as const;
const CLINICAL_DATA_CONTAINERS = [CONTAINER_NAMES.postgres, CONTAINER_NAMES.orthanc] as const;
const SHUTDOWN_CONTAINERS = [CONTAINER_NAMES.viewer, ...CLINICAL_DATA_CONTAINERS] as const;

export type ManagedInfrastructureConfig = {
  postgresPort?: number;
  orthancUrl: string;
  viewerUrl: string;
};

export async function startManagedInfrastructure(config: ManagedInfrastructureConfig): Promise<void> {
  const composeFile = resolveComposeFilePath();
  await ensureDockerAvailable();

  const postgresExists = await containerExists(CONTAINER_NAMES.postgres);
  const orthancExists = await containerExists(CONTAINER_NAMES.orthanc);

  if (postgresExists !== orthancExists) {
    throw new Error(
      'Partial Docker clinical data state detected. Found only one of horalix_postgres/orthanc. ' +
      'Startup stopped to avoid creating a new empty database or DICOM store. Contact support before continuing.'
    );
  }

  const viewerImageRebuilt = await ensureViewerImageFresh(composeFile);
  const viewerExists = await containerExists(CONTAINER_NAMES.viewer);

  if (postgresExists && orthancExists) {
    console.log('Reusing existing Docker clinical data containers: horalix_postgres, orthanc');
    await startContainers(CLINICAL_DATA_CONTAINERS);
    await startOrRefreshViewerContainer(composeFile, viewerExists, viewerImageRebuilt);
  } else {
    if (viewerExists) {
      console.log('Removing orphaned viewer container before fresh infrastructure startup.');
      await removeContainer(CONTAINER_NAMES.viewer);
    }
    console.log('Starting fresh Docker infrastructure from compose file.');
    await runComposeCommand(composeFile, ['up', '-d', ...INFRA_SERVICE_NAMES]);
  }

  await waitForTcpPort('127.0.0.1', config.postgresPort || DEFAULT_POSTGRES_PORT, 'PostgreSQL');
  await waitForTcpPort(...getHostAndPort(config.orthancUrl, 'Orthanc'));
  await waitForHttpReady(config.viewerUrl, 'OHIF viewer');
}

export async function stopManagedInfrastructure(): Promise<void> {
  await ensureDockerAvailable();
  const existingContainers: string[] = [];

  for (const containerName of SHUTDOWN_CONTAINERS) {
    if (await containerExists(containerName)) {
      existingContainers.push(containerName);
    }
  }

  if (existingContainers.length === 0) {
    return;
  }

  console.log(`Stopping Docker containers without removing them: ${existingContainers.join(', ')}`);
  await runCommand('docker', ['stop', ...existingContainers]);
}

function resolveComposeFilePath(): string {
  const candidateA = path.join(process.resourcesPath || path.join(__dirname, '..'), 'docker-compose.yml');
  if (fs.existsSync(candidateA)) return candidateA;

  const candidateB = path.join(__dirname, '..', '..', 'docker-compose.yml');
  if (fs.existsSync(candidateB)) return candidateB;

  return path.join(process.cwd(), 'docker-compose.yml');
}

function getInfraStateDir(): string {
  const infraStateDir = path.join(app.getPath('userData'), 'infra');
  fs.mkdirSync(infraStateDir, { recursive: true });
  return infraStateDir;
}

function getViewerBuildStampPath(): string {
  return path.join(getInfraStateDir(), VIEWER_BUILD_STAMP_FILE);
}

function resolveViewerFingerprintRoots(composeFile: string): string[] {
  const resourcesRoot = path.dirname(composeFile);
  return [
    composeFile,
    path.join(resourcesRoot, 'horalix_viewer', 'runtime_config'),
    path.join(resourcesRoot, 'horalix_viewer', 'Viewers-3.12.0'),
  ];
}

async function appendPathFingerprint(hash: ReturnType<typeof createHash>, targetPath: string): Promise<void> {
  const normalizedTargetPath = path.resolve(targetPath);
  const relativeRoot = path.dirname(normalizedTargetPath);

  async function visit(currentPath: string): Promise<void> {
    if (!fs.existsSync(currentPath)) {
      hash.update(`missing:${path.relative(relativeRoot, currentPath)}\n`);
      return;
    }

    const stats = await fs.promises.stat(currentPath);
    const relativePath = path.relative(relativeRoot, currentPath) || path.basename(currentPath);
    hash.update(
      `${stats.isDirectory() ? 'dir' : 'file'}:${relativePath}:${stats.size}:${stats.mtimeMs}\n`
    );

    if (!stats.isDirectory()) {
      return;
    }

    const childNames = await fs.promises.readdir(currentPath);
    childNames.sort((left, right) => left.localeCompare(right));
    for (const childName of childNames) {
      await visit(path.join(currentPath, childName));
    }
  }

  await visit(normalizedTargetPath);
}

async function computeViewerBuildFingerprint(composeFile: string): Promise<string> {
  const hash = createHash('sha256');
  const fingerprintRoots = resolveViewerFingerprintRoots(composeFile);

  for (const fingerprintRoot of fingerprintRoots) {
    await appendPathFingerprint(hash, fingerprintRoot);
  }

  return hash.digest('hex');
}

async function readViewerBuildStamp(): Promise<string | null> {
  const stampPath = getViewerBuildStampPath();
  if (!fs.existsSync(stampPath)) {
    return null;
  }

  try {
    const rawValue = await fs.promises.readFile(stampPath, 'utf-8');
    const parsed = JSON.parse(rawValue) as { fingerprint?: string };
    return typeof parsed.fingerprint === 'string' ? parsed.fingerprint : null;
  } catch {
    return null;
  }
}

async function writeViewerBuildStamp(fingerprint: string): Promise<void> {
  const stampPath = getViewerBuildStampPath();
  await fs.promises.writeFile(
    stampPath,
    JSON.stringify({ fingerprint }, null, 2),
    'utf-8'
  );
}

async function hasViewerImage(): Promise<boolean> {
  try {
    await runCommand('docker', ['image', 'inspect', VIEWER_IMAGE_NAME]);
    return true;
  } catch {
    return false;
  }
}

async function ensureViewerImageFresh(composeFile: string): Promise<boolean> {
  const currentFingerprint = await computeViewerBuildFingerprint(composeFile);
  const previousFingerprint = await readViewerBuildStamp();
  const viewerImageExists = await hasViewerImage();

  if (previousFingerprint === currentFingerprint && viewerImageExists) {
    return false;
  }

  console.log('Building Horalix viewer Docker image for current packaged resources.');
  await runComposeCommand(composeFile, ['build', 'horalix-viewer']);
  await writeViewerBuildStamp(currentFingerprint);
  return true;
}

async function startOrRefreshViewerContainer(
  composeFile: string,
  viewerExists: boolean,
  viewerImageRebuilt: boolean
): Promise<void> {
  const usesCurrentResources = viewerExists
    ? await viewerContainerUsesCurrentResources(composeFile)
    : false;
  const sharesOrthancNetwork = viewerExists
    ? await containersShareNetwork(CONTAINER_NAMES.viewer, CONTAINER_NAMES.orthanc)
    : false;

  if (!viewerExists || viewerImageRebuilt || !usesCurrentResources || !sharesOrthancNetwork) {
    if (viewerExists) {
      console.log('Recreating Horalix viewer container for current packaged resources.');
      await removeContainer(CONTAINER_NAMES.viewer);
    } else {
      console.log('Creating Horalix viewer container.');
    }

    const orthancComposeProject = await getComposeProjectName(CONTAINER_NAMES.orthanc);
    const composeEnv = orthancComposeProject
      ? { COMPOSE_PROJECT_NAME: orthancComposeProject }
      : {};

    if (orthancComposeProject) {
      console.log(`Creating Horalix viewer in existing Orthanc Docker Compose project: ${orthancComposeProject}`);
    }

    await runComposeCommand(composeFile, ['up', '-d', '--no-deps', 'horalix-viewer'], composeEnv);
    return;
  }

  console.log('Reusing existing Horalix viewer container.');
  await startContainers([CONTAINER_NAMES.viewer]);
}

async function getComposeProjectName(containerName: string): Promise<string | null> {
  try {
    const projectName = await runCommandOutput('docker', [
      'inspect',
      '--format',
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      containerName,
    ]);
    const normalizedProjectName = projectName.trim();
    return normalizedProjectName && normalizedProjectName !== '<no value>'
      ? normalizedProjectName
      : null;
  } catch {
    return null;
  }
}

async function containersShareNetwork(leftContainerName: string, rightContainerName: string): Promise<boolean> {
  const [leftNetworks, rightNetworks] = await Promise.all([
    getContainerNetworkNames(leftContainerName),
    getContainerNetworkNames(rightContainerName),
  ]);

  return leftNetworks.some((networkName) => rightNetworks.includes(networkName));
}

async function getContainerNetworkNames(containerName: string): Promise<string[]> {
  try {
    const rawNetworks = await runCommandOutput('docker', [
      'inspect',
      '--format',
      '{{json .NetworkSettings.Networks}}',
      containerName,
    ]);
    const networks = JSON.parse(rawNetworks) as Record<string, unknown>;
    return Object.keys(networks);
  } catch {
    return [];
  }
}

async function viewerContainerUsesCurrentResources(composeFile: string): Promise<boolean> {
  try {
    const rawMounts = await runCommandOutput('docker', [
      'inspect',
      '--format',
      '{{json .Mounts}}',
      CONTAINER_NAMES.viewer,
    ]);
    const mounts = JSON.parse(rawMounts) as Array<{ Source?: string; Destination?: string }>;
    const resourcesRoot = path.dirname(composeFile);
    const expectedSourcesByDestination = new Map([
      [
        '/usr/share/nginx/html/app-config.js',
        path.join(resourcesRoot, 'horalix_viewer', 'runtime_config', 'app-config.js'),
      ],
      [
        '/usr/share/nginx/html/orthanc-standalone.json',
        path.join(resourcesRoot, 'horalix_viewer', 'runtime_config', 'orthanc-standalone.json'),
      ],
      [
        '/start-ohif.sh',
        path.join(resourcesRoot, 'horalix_viewer', 'runtime_config', 'start-ohif.sh'),
      ],
    ]);

    for (const [destination, expectedSource] of expectedSourcesByDestination) {
      const mount = mounts.find((candidate) => candidate.Destination === destination);
      if (!mount?.Source || normalizeDockerPath(mount.Source) !== normalizeDockerPath(expectedSource)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeDockerPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/([a-zA-Z])\//, '$1:/')
    .toLowerCase();
}

async function containerExists(containerName: string): Promise<boolean> {
  try {
    await runCommand('docker', ['container', 'inspect', containerName]);
    return true;
  } catch {
    return false;
  }
}

async function startContainers(containerNames: readonly string[]): Promise<void> {
  await runCommand('docker', ['start', ...containerNames]);
}

async function removeContainer(containerName: string): Promise<void> {
  await runCommand('docker', ['rm', '-f', containerName]);
}

async function ensureDockerAvailable(): Promise<void> {
  if (await checkDocker()) {
    return;
  }

  throw new Error('Docker is required for packaged server mode but the Docker daemon is not reachable.');
}

function checkDocker(): Promise<boolean> {
  return new Promise((resolve) => {
    const processRef = spawn('docker', ['info'], { stdio: 'ignore' });
    processRef.on('error', () => resolve(false));
    processRef.on('exit', (code) => resolve(code === 0));
  });
}

async function runComposeCommand(
  composeFile: string,
  args: string[],
  env: NodeJS.ProcessEnv = {}
): Promise<void> {
  try {
    await runCommand('docker', ['compose', '-f', composeFile, ...args], env);
    return;
  } catch (dockerComposeError) {
    try {
      await runCommand('docker-compose', ['-f', composeFile, ...args], env);
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

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<void> {
  return runCommandOutput(command, args, env).then(() => undefined);
}

function runCommandOutput(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const processRef = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    processRef.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    processRef.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    processRef.on('error', reject);
    processRef.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} exited with code ${code}.\n` +
          `${stdout.trim()}\n${stderr.trim()}`.trim()
        )
      );
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
