#!/usr/bin/env node
/*
 * Build a per-hospital client installer with the server URL baked in, so the
 * doctor's app connects automatically with no setup wizard.
 *
 * Usage (note the `--` so npm forwards the args):
 *   npm run dist:client:tenant -- <subdomain|full-url> [--dir]
 *
 * Examples:
 *   npm run dist:client:tenant -- stjohns
 *       -> bakes https://stjohns.echo.horalix.com, builds the NSIS installer
 *          into dist/client/
 *   npm run dist:client:tenant -- test --dir
 *       -> bakes https://test.echo.horalix.com, builds an UNPACKED dir
 *          (dist/client/win-unpacked) for quick testing
 *   npm run dist:client:tenant -- https://demo.example.com
 *       -> bakes an arbitrary full URL
 *
 * Mechanism: sets HORALIX_SERVER_BASE_URL, which electron-builder.client.config.js
 * injects into the packaged package.json as `horalixServerBaseUrl`. runtime.ts
 * reads that and treats it as authoritative (wins over the setup wizard).
 */
const { execSync } = require('child_process');

// All tenants live under this zone: <subdomain>.<BASE_DOMAIN>
const BASE_DOMAIN = 'echo.horalix.com';

const args = process.argv.slice(2);
const wantDir = args.includes('--dir');
const target = args.find((a) => a !== '--dir');

if (!target) {
  console.error('Usage: npm run dist:client:tenant -- <subdomain|full-url> [--dir]');
  process.exit(1);
}

const serverUrl = /^https?:\/\//i.test(target)
  ? target.replace(/\/+$/, '')
  : `https://${target}.${BASE_DOMAIN}`;

const npmScript = wantDir ? 'pack:client' : 'dist:client';

console.log(`[build-client-tenant] Baking server URL: ${serverUrl}`);
console.log(`[build-client-tenant] Running: npm run ${npmScript}`);

execSync(`npm run ${npmScript}`, {
  stdio: 'inherit',
  env: {
    ...process.env,
    HORALIX_SERVER_BASE_URL: serverUrl,
    HORALIX_VIEWER_BASE_URL: serverUrl,
  },
});
