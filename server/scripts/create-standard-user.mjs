#!/usr/bin/env node
/**
 * create-standard-user.mjs — provision a normal (non-admin) user for testing.
 *
 * Mirrors the documented P1 recipe in agent-tests/subscription/_helpers.md:
 *   register_id → validateCode → submit_password → login, using the dev
 *   verification code "123456" (server/src/index.ts verificationCodeGeneratorMethod
 *   returns it; there is no real email/SMS step in dev).
 *
 * Unlike the admin user (administrator permission group, provisioned from env on
 * boot), this creates a user in the DEFAULT permission group — i.e. the real
 * freemium experience — with full onboarding via authTriggers (starter bundles +
 * Leitner). Prints { email, password, token, userId } as JSON; the token injects
 * into localStorage["token"] exactly like the admin token from agent-token.mjs.
 *
 * Usage (run from the server/ workspace so server/.env resolves for --base):
 *   cd server && node scripts/create-standard-user.mjs
 *   cd server && node scripts/create-standard-user.mjs --email me@test.dev --password 'Test1234!'
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

const base = arg('base', process.env.BASE_URL_API || process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const DEV_CODE = '123456'; // verificationCodeGeneratorMethod() returns this in dev
const email = arg('email', `e2e+${Date.now()}@example.com`);
const password = arg('password', 'Test1234!');

const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' };

async function post(route, payload) {
  const res = await fetch(`${base}${route}`, { method: 'POST', headers, body: JSON.stringify(payload) });
  let body = {};
  try { body = await res.json(); } catch { /* ignore non-JSON */ }
  return { res, body };
}

function decodeUserId(token) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return claims.id || null;
  } catch { return null; }
}

// Steps 1-3 are tolerant: an already-existing email just resets its password via
// submit_password, so reruns don't hard-fail. Login (step 4) is the real goal.
const r1 = await post('/user/register_id', { idType: 'email', id: email });
console.error(`register_id     → HTTP ${r1.res.status}`);
const r2 = await post('/user/validateCode', { idType: 'email', id: email, code: DEV_CODE });
console.error(`validateCode    → HTTP ${r2.res.status}`);
const r3 = await post('/user/submit_password', { idType: 'email', id: email, password, code: DEV_CODE });
console.error(`submit_password → HTTP ${r3.res.status}`);

const login = await post('/user/login', { idType: 'email', id: email, password });
if (!login.res.ok || !login.body.token) {
  console.error(`✗ Login failed (HTTP ${login.res.status}) for ${email}: ${JSON.stringify(login.body)}`);
  console.error(`  Is the server up on ${base}? Did registration succeed above?`);
  process.exit(1);
}

const token = login.body.token;
console.error(`✓ Standard user ready: ${email}`);
process.stdout.write(JSON.stringify({ email, password, token, userId: decodeUserId(token) }, null, 2) + '\n');
