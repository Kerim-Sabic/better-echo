import * as fs from 'fs';
import * as path from 'path';

export type RuntimeMode = 'server' | 'client';

export type RuntimeConfig = {
  runtimeMode: RuntimeMode;
  backendBaseUrl: string | null;
  viewerBaseUrl: string | null;
};

export type PersistedClientRuntimeConfig = {
  serverBaseUrl?: string | null;
  viewerBaseUrl?: string | null;
};

const SERVER_MODE: RuntimeMode = 'server';
const CLIENT_MODE: RuntimeMode = 'client';
const RUNTIME_MODE_ENV_KEY = 'ELECTRON_RUNTIME_MODE';
const SERVER_BASE_URL_ENV_KEY = 'ELECTRON_SERVER_BASE_URL';
const VIEWER_BASE_URL_ENV_KEY = 'ELECTRON_VIEWER_BASE_URL';
const SERVER_VIEWER_BASE_URL_ENV_KEY = 'VIEWER_PUBLIC_BASE_URL';
const PACKAGED_RUNTIME_MODE_FIELD = 'horalixRuntimeMode';

let cachedPackagedRuntimeMode: RuntimeMode | null | undefined;

function isRuntimeMode(value: unknown): value is RuntimeMode {
  return value === SERVER_MODE || value === CLIENT_MODE;
}

function readPackagedRuntimeMode(): RuntimeMode | null {
  if (cachedPackagedRuntimeMode !== undefined) {
    return cachedPackagedRuntimeMode;
  }

  cachedPackagedRuntimeMode = null;

  const resourcesPath = process.resourcesPath || '';
  const packageJsonPaths = [
    path.join(resourcesPath, 'app.asar', 'package.json'),
    path.join(resourcesPath, 'app', 'package.json'),
    path.join(process.cwd(), 'package.json'),
  ];

  for (const packageJsonPath of packageJsonPaths) {
    try {
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      const rawValue = fs.readFileSync(packageJsonPath, 'utf-8');
      const parsed = JSON.parse(rawValue) as Record<string, unknown>;
      const runtimeMode = parsed[PACKAGED_RUNTIME_MODE_FIELD];

      if (isRuntimeMode(runtimeMode)) {
        cachedPackagedRuntimeMode = runtimeMode;
        return cachedPackagedRuntimeMode;
      }
    } catch {
      continue;
    }
  }

  return cachedPackagedRuntimeMode;
}

export function normalizeBaseUrl(value: string | undefined | null): string | null {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawValue);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    return parsedUrl.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getRuntimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  const configuredMode = String(env[RUNTIME_MODE_ENV_KEY] ?? '').trim().toLowerCase();
  if (isRuntimeMode(configuredMode)) {
    return configuredMode;
  }

  return readPackagedRuntimeMode() || SERVER_MODE;
}

export function getConfiguredServerBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return normalizeBaseUrl(env[SERVER_BASE_URL_ENV_KEY]);
}

export function getConfiguredViewerBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return normalizeBaseUrl(env[VIEWER_BASE_URL_ENV_KEY]);
}

export function getServerViewerBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return normalizeBaseUrl(env[SERVER_VIEWER_BASE_URL_ENV_KEY]) || 'http://localhost:3001';
}

export function getLocalBackendBaseUrl(localBackendPort: number | null): string | null {
  if (!Number.isInteger(localBackendPort) || localBackendPort === null || localBackendPort <= 0) {
    return null;
  }

  return `http://localhost:${localBackendPort}`;
}

export function resolveRuntimeConfig(
  localBackendPort: number | null,
  env: NodeJS.ProcessEnv = process.env,
  persistedClientConfig: PersistedClientRuntimeConfig = {}
): RuntimeConfig {
  const runtimeMode = getRuntimeMode(env);
  const persistedServerBaseUrl = normalizeBaseUrl(persistedClientConfig.serverBaseUrl);
  const persistedViewerBaseUrl = normalizeBaseUrl(persistedClientConfig.viewerBaseUrl);

  return {
    runtimeMode,
    backendBaseUrl:
      runtimeMode === CLIENT_MODE
        ? persistedServerBaseUrl || getConfiguredServerBaseUrl(env)
        : getLocalBackendBaseUrl(localBackendPort),
    viewerBaseUrl:
      runtimeMode === CLIENT_MODE
        ? persistedViewerBaseUrl || getConfiguredViewerBaseUrl(env)
        : getServerViewerBaseUrl(env),
  };
}

export function resolveBackendHealthUrl(
  localBackendPort: number | null,
  env: NodeJS.ProcessEnv = process.env,
  persistedClientConfig: PersistedClientRuntimeConfig = {}
): string | null {
  const runtimeConfig = resolveRuntimeConfig(localBackendPort, env, persistedClientConfig);
  return runtimeConfig.backendBaseUrl ? `${runtimeConfig.backendBaseUrl}/api/health` : null;
}
