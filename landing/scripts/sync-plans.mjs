#!/usr/bin/env node
/**
 * Fetches the live plan list for the pricing section, at build time.
 *
 * Usage: node scripts/sync-plans.mjs <api-origin> [--strict]
 *
 * Calls the API's anonymous `getSubscriptionPlans` RPC (built from Stripe product metadata, ADR-004)
 * and writes app/data/plans.json, which nuxt.config.ts prefers over the committed snapshot. So the
 * page shows what Stripe sells, yet stays static: no runtime fetch, nothing to fail in a browser.
 *
 * If the API is unreachable or answers with something that does not look like the four tiers, the
 * build keeps the snapshot and says so. --strict turns that into a failure instead.
 */
import { writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const out = resolve(here, '../app/data/plans.json');
const [origin] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const strict = process.argv.includes('--strict');
const TIERS = ['starter', 'reader', 'learner', 'coach'];

function giveUp(reason) {
    // A stale plans.json from an earlier run must not outlive a failed sync.
    rmSync(out, { force: true });
    if (strict) {
        console.error(`sync-plans: ${reason}`);
        process.exit(1);
    }
    console.warn(`  ⚠ sync-plans: ${reason}. Using the committed app/data/plans.snapshot.json.`);
    process.exit(0);
}

if (!origin || !/^https?:\/\//.test(origin)) giveUp('no API origin given');

try {
    const login = await fetch(`${origin}/user/loginAnonymous`, { signal: AbortSignal.timeout(15000) });
    const { token } = await login.json();
    if (!token) giveUp(`anonymous login returned no token (HTTP ${login.status})`);

    const res = await fetch(`${origin}/function/run`, {
        method: 'POST',
        headers: { authorization: token, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'getSubscriptionPlans', args: {} }),
        signal: AbortSignal.timeout(20000),
    });
    const body = await res.json();
    const plans = body?.data;

    const ids = Array.isArray(plans) ? plans.map((p) => p.id) : [];
    if (!TIERS.every((t) => ids.includes(t))) giveUp(`unexpected plan list (${JSON.stringify(ids)})`);
    for (const p of plans) {
        if (p.isPaid && typeof p.pricing?.monthly?.gbp !== 'number') giveUp(`plan ${p.id} has no monthly GBP price`);
    }

    writeFileSync(out, `${JSON.stringify(plans, null, 2)}\n`);
    const prices = plans.map((p) => `${p.name} ${p.pricing ? `£${p.pricing.monthly.gbp}` : 'free'}`).join(' · ');
    console.info(`  ✔ sync-plans: ${prices}`);
} catch (error) {
    giveUp(`request failed: ${error.message}`);
}
