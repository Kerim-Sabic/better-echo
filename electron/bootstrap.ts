import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function writeBootstrapLog(message: string): void {
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), 'horalix-electron-bootstrap.log'),
      `[${new Date().toISOString()}] ${message}\n`,
      'utf-8'
    );
  } catch {
    // Logging must never block startup.
  }
}

function withoutRunAsNodeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') {
      delete env[key];
    }
  }
  return env;
}

function getRelaunchArgs(): string[] {
  const args = process.argv.slice(1);
  const isDevEntrypoint = args.some((arg) => /\.js$/i.test(arg));

  if (isDevEntrypoint) {
    return args;
  }

  return [];
}

function relaunchWithoutRunAsNode(): void {
  const args = getRelaunchArgs();
  const env = withoutRunAsNodeEnv();

  writeBootstrapLog(
    `Relaunching without ELECTRON_RUN_AS_NODE: execPath=${process.execPath} args=${JSON.stringify(args)}`
  );

  const child = spawn(process.execPath, args, {
    detached: true,
    env,
    stdio: 'ignore',
    windowsHide: false,
  });

  child.on('error', (error) => {
    writeBootstrapLog(`Relaunch failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  });

  child.unref();
}

if (process.env.ELECTRON_RUN_AS_NODE) {
  relaunchWithoutRunAsNode();
  process.exit(0);
}

require('./main.js');
