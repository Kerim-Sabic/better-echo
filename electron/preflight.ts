import { spawn } from 'child_process';
import * as path from 'path';

function resolvePreflightScriptPath(options: { isDev: boolean; resourcesPath: string }): string {
  if (options.isDev) {
    return path.join(process.cwd(), 'scripts', 'server_preflight.ps1');
  }

  return path.join(options.resourcesPath, 'scripts', 'server_preflight.ps1');
}

export function runServerPreflight(options: { isDev: boolean; resourcesPath: string }): Promise<void> {
  const scriptPath = resolvePreflightScriptPath(options);

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const processRef = spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    processRef.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    processRef.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    processRef.on('error', reject);
    processRef.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Server preflight failed with code ${code}.\n` +
          `${stdout.trim()}\n${stderr.trim()}`.trim()
        )
      );
    });
  });
}
