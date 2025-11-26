import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import * as path from 'path';

let llmProcess: ChildProcess | null = null;
const LLM_PORT = 8012;
const LLM_URL = `http://localhost:${LLM_PORT}`;

/**
 * Check if LLM is already running by probing the health endpoint
 */
export async function isLLMRunning(): Promise<boolean> {
    try {
        // vLLM doesn't have a /health endpoint by default, so we check the base URL or /v1/models
        await axios.get(`${LLM_URL}/v1/models`, { timeout: 2000 });
        console.log('LLM is already running');
        return true;
    } catch {
        return false;
    }
}

/**
 * Wait for LLM to become healthy after startup
 */
async function waitForLLMHealth(maxAttempts = 60): Promise<boolean> {
    console.log('Waiting for LLM to become ready...');
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await axios.get(`${LLM_URL}/v1/models`, { timeout: 2000 });
            console.log(`LLM health check passed (attempt ${i + 1}/${maxAttempts})`);
            return true;
        } catch {
            // wait and retry (2 second intervals, 60 attempts = 2 minutes max)
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return false;
}

/**
 * Start the LLM service using PowerShell script
 */
export async function startLLM(options: { resourcesPath: string }): Promise<void> {
    // Check if already running
    const alreadyRunning = await isLLMRunning();
    if (alreadyRunning) {
        console.log('LLM is already running, skipping startup');
        return;
    }

    console.log('Starting LLM service...');

    // Determine script path (works in both dev and production)
    let startScriptPath: string;
    if (process.env.NODE_ENV === 'development') {
        // In dev, scripts are at project root
        startScriptPath = path.join(process.cwd(), 'scripts', 'start_llm.ps1');
    } else {
        // In production, scripts are in resources
        startScriptPath = path.join(options.resourcesPath, 'scripts', 'start_llm.ps1');
    }
    console.log('LLM start script path:', startScriptPath);

    // Spawn PowerShell to run the start script
    llmProcess = spawn('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', startScriptPath
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false, // Keep attached so we can kill it
    });

    llmProcess.stdout?.on('data', (data) => {
        console.log('[LLM]', data.toString().trim());
    });

    llmProcess.stderr?.on('data', (data) => {
        console.error('[LLM Error]', data.toString().trim());
    });

    llmProcess.on('error', (error) => {
        console.error('LLM process error:', error);
    });

    llmProcess.on('exit', (code, signal) => {
        console.log(`LLM process exited with code ${code} and signal ${signal}`);
        llmProcess = null;
    });

    // Wait for LLM to become healthy
    const healthOk = await waitForLLMHealth();
    if (!healthOk) {
        console.warn('LLM failed to start - health check timeout. Continuing without LLM.');
        // Don't throw - allow app to continue without LLM
        stopLLM();
    } else {
        console.log('LLM service started successfully');
    }
}

/**
 * Stop the LLM service using PowerShell script
 */
export function stopLLM(): void {
    console.log('Stopping LLM service...');

    // Determine script path (works in both dev and production)
    let stopScriptPath: string;
    if (process.env.NODE_ENV === 'development') {
        // In dev, scripts are at project root
        stopScriptPath = path.join(process.cwd(), 'scripts', 'stop_llm.ps1');
    } else {
        // In production, scripts are in resources
        stopScriptPath = path.join(process.resourcesPath || '', 'scripts', 'stop_llm.ps1');
    }

    console.log('LLM stop script path:', stopScriptPath);

    // Run stop script synchronously to ensure cleanup
    const { spawnSync } = require('child_process');
    const result = spawnSync('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', stopScriptPath
    ], {
        stdio: 'inherit',
        timeout: 15000 // 15 second timeout (allows for WSL startup latency)
    });

    if (result.error) {
        console.error('Error stopping LLM:', result.error);
    } else {
        console.log('LLM stop script completed');
    }

    // Also kill the PowerShell process if it's still running
    if (llmProcess) {
        try {
            llmProcess.kill('SIGTERM');
            console.log('Killed LLM PowerShell process');
        } catch (err) {
            console.error('Error killing LLM process:', err);
        }
        llmProcess = null;
    }
}

/**
 * Get the LLM service URL
 */
export function getLLMUrl(): string {
    return LLM_URL;
}
