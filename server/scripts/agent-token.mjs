#!/usr/bin/env node
/**
 * agent-token.mjs — mint a JWT for browser validation without Google OAuth.
 *
 * Why this exists: the dashboard UI only offers Google OAuth, which an agent
 * can't drive. But the SPA treats ANY valid JWT in localStorage["token"] as a
 * login — middleware/auth.ts → profileStore.loginWithLastSession() loads it and
 * validates via POST /verify/token, exactly as it would a Google-issued token.
 * So we log in over the modular-rest HTTP API and hand back the raw token to
 * inject into the browser.
 *
 * Default credentials are the admin user the framework auto-provisions from
 * ADMIN_EMAIL / ADMIN_PASSWORD (server/src/index.ts → createRest({ adminUser }),
 * created loginable as type:'user').
 *
 * NOTE: validate changes with a STANDARD user by default (create-standard-user.mjs).
 * The admin is a privileged `administrator` account, not a representative user — its
 * freemium/tier behavior isn't guaranteed to match a real user's (it may be treated
 * specially now or in the future). Use the admin token only when admin/elevated
 * behavior is intentionally under test, or when you explicitly ask for it.
 *
 * Password encoding: this repo's modular-rest server base64-encodes the password
 * itself inside loginUser(), so POST /user/login wants PLAINTEXT here. An older
 * build (the live dev server) wanted a pre-encoded password. We try plaintext
 * first and fall back to base64 so the same script works against both.
 *
 * Usage (run from the server/ workspace so server/.env resolves):
 *   cd server && node scripts/agent-token.mjs                 # admin token -> stdout
 *   cd server && node scripts/agent-token.mjs --inject        # localStorage snippet -> stdout
 *   cd server && node scripts/agent-token.mjs --email a@b.c --password pw --base http://localhost:8080
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const base = arg('base', process.env.BASE_URL_API || process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const email = arg('email', process.env.ADMIN_EMAIL || '');
const password = arg('password', process.env.ADMIN_PASSWORD || '');

if (!email || !password) {
  console.error('✗ Missing credentials. Pass --email/--password or set ADMIN_EMAIL/ADMIN_PASSWORD in server/.env.');
  process.exit(1);
}

async function login(pw) {
  const res = await fetch(`${base}/user/login`, {
    method: 'POST',
    // Origin is required: the server CORS handler rejects requests with no Origin.
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({ idType: 'email', id: email, password: pw }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  return { ok: res.ok && !!body.token, token: body.token, status: res.status, body };
}

// Plaintext first (correct for this repo's server), base64 fallback (older dev server).
let result = await login(password);
let encoding = 'plaintext';
if (!result.ok) {
  const base64 = await login(Buffer.from(password).toString('base64'));
  if (base64.ok) { result = base64; encoding = 'base64'; }
}

if (!result.ok) {
  console.error(`✗ Login failed (HTTP ${result.status}) for ${email} at ${base}: ${JSON.stringify(result.body)}`);
  console.error('  Is the server up on that URL? Are the credentials correct?');
  process.exit(1);
}

console.error(`✓ Logged in as ${email} via ${base} (${encoding})`);
if (hasFlag('inject')) {
  // Paste into the Playwright MCP's browser_evaluate AFTER navigating to the app origin.
  process.stdout.write(`localStorage.setItem('token', ${JSON.stringify(result.token)})\n`);
} else {
  process.stdout.write(result.token + '\n');
}
