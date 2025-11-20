import { app, session } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export type OrthancAuthConfig = {
    url: string;
    user: string;
    pass: string;
};

export function setupOrthancAuth(config: OrthancAuthConfig): void {
    try {
        const orthancUrl = new URL(config.url);
        const orthancOrigin = orthancUrl.origin;
        const orthancHost = orthancUrl.hostname;
        const orthancPort = orthancUrl.port
            ? parseInt(orthancUrl.port, 10)
            : (orthancUrl.protocol === 'https:' ? 443 : 80);
        const basicAuth = 'Basic ' + Buffer.from(`${config.user}:${config.pass}`).toString('base64');

        session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [orthancOrigin + '/*'] }, (details, callback) => {
            const headers = details.requestHeaders;
            headers['Authorization'] = basicAuth;
            callback({ requestHeaders: headers });
        });

        app.on('login', (event, _webContents, _request, authInfo, callback) => {
            if (!authInfo.isProxy && authInfo.host === orthancHost && authInfo.port === orthancPort) {
                event.preventDefault();
                callback(config.user, config.pass);
            }
        });
    } catch (e) {
        console.warn('Failed to set up Orthanc auth interceptors:', e);
    }
}

export async function attemptStartOrthanc(): Promise<void> {
    const composeFile = resolveComposeFilePath();
    const haveDocker = await checkDocker();
    if (!haveDocker) {
        console.warn('Docker not found. Skipping Orthanc startup.');
        return;
    }
    try {
        await runCommand('docker', ['compose', '-f', composeFile, 'up', '-d', 'orthanc']);
        console.log('Orthanc started (docker compose).');
        return;
    } catch (e) {
        console.warn('docker compose failed, trying docker-compose...', e);
    }
    await runCommand('docker-compose', ['-f', composeFile, 'up', '-d', 'orthanc']).then(() => {
        console.log('Orthanc started (docker-compose).');
    }).catch((err) => {
        console.warn('Failed to start Orthanc via docker-compose:', err);
    });
}

export async function stopOrthanc(): Promise<void> {
    const composeFile = resolveComposeFilePath();
    const haveDocker = await checkDocker();
    if (!haveDocker) {
        console.warn('Docker not found. Cannot stop Orthanc.');
        return;
    }
    try {
        await runCommand('docker', ['compose', '-f', composeFile, 'down']);
        console.log('Orthanc stopped (docker compose down).');
        return;
    } catch (e) {
        console.warn('docker compose down failed, trying docker-compose down...', e);
    }
    try {
        await runCommand('docker-compose', ['-f', composeFile, 'down']);
        console.log('Orthanc stopped (docker-compose down).');
        return;
    } catch (e) {
        console.warn('docker-compose down failed, trying stop/rm...', e);
    }
    try {
        await runCommand('docker', ['compose', '-f', composeFile, 'stop', 'orthanc']);
        await runCommand('docker', ['compose', '-f', composeFile, 'rm', '-f', 'orthanc']);
        console.log('Orthanc stopped (docker compose stop/rm).');
    } catch (e) {
        try {
            await runCommand('docker-compose', ['-f', composeFile, 'stop', 'orthanc']);
            await runCommand('docker-compose', ['-f', composeFile, 'rm', '-f', 'orthanc']);
            console.log('Orthanc stopped (docker-compose stop/rm).');
        } catch (err) {
            console.warn('Failed to stop Orthanc via docker compose/compose stop/rm:', err);
        }
    }
}

function resolveComposeFilePath(): string {
    const candidateA = path.join(process.resourcesPath || path.join(__dirname, '..'), 'docker-compose.yml');
    if (fs.existsSync(candidateA)) return candidateA;
    const candidateB = path.join(__dirname, '..', '..', 'docker-compose.yml');
    if (fs.existsSync(candidateB)) return candidateB;
    const candidateC = path.join(process.cwd(), 'docker-compose.yml');
    return candidateC;
}

function checkDocker(): Promise<boolean> {
    return new Promise((resolve) => {
        const p = spawn('docker', ['--version'], { stdio: 'ignore' });
        p.on('error', () => resolve(false));
        p.on('exit', (code) => resolve(code === 0));
    });
}

function runCommand(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { stdio: 'ignore' });
        p.on('error', reject);
        p.on('exit', (code) => {
            if (code === 0) resolve(); else reject(new Error(`${cmd} exited with code ${code}`));
        });
    });
}
