import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let installed = false;

function formatPart(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function installStartupLogging(): void {
  if (installed) {
    return;
  }
  installed = true;

  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logPath = path.join(
      logsDir,
      `startup-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    );

    const writeLine = (level: string, args: unknown[]) => {
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] [${level}] ${args.map(formatPart).join(' ')}\n`,
        'utf-8'
      );
    };

    const originalLog = console.log.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    console.log = (...args: unknown[]) => {
      writeLine('log', args);
      originalLog(...args);
    };
    console.warn = (...args: unknown[]) => {
      writeLine('warn', args);
      originalWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      writeLine('error', args);
      originalError(...args);
    };

    console.log('Startup logging enabled:', logPath);
  } catch (error) {
    console.warn('Failed to install startup logging:', error);
  }
}
