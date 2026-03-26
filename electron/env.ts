import * as fs from 'fs';
import * as path from 'path';

function parseEnvLine(line: string): [string, string] | null {
  const trimmedLine = line.trim();
  if (!trimmedLine || trimmedLine.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmedLine.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmedLine.slice(0, separatorIndex).trim();
  let value = trimmedLine.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (!key) {
    return null;
  }

  return [key, value];
}

function resolveBackendEnvPath(): string | null {
  const candidatePaths = [
    path.join(process.resourcesPath || '', 'backend', '.env'),
    path.join(process.cwd(), 'backend', '.env'),
  ];

  for (const candidatePath of candidatePaths) {
    if (candidatePath && fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

export function loadBackendEnvIntoProcessEnv(): void {
  const envFilePath = resolveBackendEnvPath();
  if (!envFilePath) {
    return;
  }

  try {
    const rawValue = fs.readFileSync(envFilePath, 'utf-8');
    for (const line of rawValue.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }

      const [key, value] = parsed;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn('Failed to load backend .env into Electron process env:', error);
  }
}
