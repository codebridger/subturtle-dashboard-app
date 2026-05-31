/*
 * Reference executor for agent-tests/subscription/tier-ladder.spec.md.
 *
 * Drives the live server (HTTP RPC) + Stripe test API + Mongo, exercises every
 * gate at its boundary, tallies PASS/FAIL, and writes a report to
 * agent-tests/_runs/. An agent can run this directly or follow the .spec.md by
 * hand. Preconditions (see agent-tests/README.md): Mongo up, server on :8080
 * (node 16-18, fresh dist), `stripe listen --forward-to
 * localhost:8080/gateway/webhook/stripe` running, sk_test key + seeded products.
 *
 *   cd server && PATH="<node18+ bin>:$PATH" node scripts/e2e-tier-ladder.js
 *
 * NOTE the two repo facts this encodes (and the markdown helpers call out):
 *   - Mongo collections are PLURAL (free_credits, subscriptions, stripe_customers,
 *     phrase_bundles, phrases, usages) — Mongoose pluralizes model names.
 *   - user_access RPCs need `userId` IN THE ARGS (the framework does not inject it).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const BASE = 'http://localhost:8080';
const DB = 'mongodb://localhost:27017/subturtle_dev_user_content';
const results = [];
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? `  — ${detail}` : ''));
}

function req(method, p, { headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + p);
    const r = http.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { let j; try { j = JSON.parse(b); } catch { j = b; } resolve({ status: res.statusCode, body: j }); }); });
    r.on('error', (e) => resolve({ status: 0, body: String(e) }));
    if (data) r.write(data); r.end();
  });
}
const mongo = (js) => execFileSync('mongosh', [DB, '--quiet', '--eval', js], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()).id;
// success -> body.data; error -> body.message (string)
const ok = (r) => (r.body && r.body.status !== 'error' ? r.body.data : undefined);
const isLimit = (r, feature) => r.status === 400 && typeof r.body?.message === 'string' && r.body.message.includes('TIER_LIMIT_REACHED') && r.body.message.includes(feature);

(async () => {
  let customer, userId, EMAIL, token;
  const call = (name, args = {}) => req('POST', '/function/run', { headers: { authorization: token }, body: { name, args: { userId, ...args } } });
  const details = async () => ok(await call('getSubscriptionDetails'));
  async function awaitTier(expect, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const d = await details();
      if (d && (expect === 'free' ? d.is_freemium === true : d.tier === expect)) return d;
      await sleep(1000);
    }
    return null;
  }

  try {
    log('\n== Setup ==');
    EMAIL = `e2e+${Date.now()}@example.com`; const PW = 'Test1234!';
    await req('POST', '/user/register_id', { body: { idType: 'email', id: EMAIL } });
    await req('POST', '/user/validateCode', { body: { idType: 'email', id: EMAIL, code: '123456' } });
    await req('POST', '/user/submit_password', { body: { idType: 'email', id: EMAIL, password: PW, code: '123456' } });
    token = (await req('POST', '/user/login', { body: { idType: 'email', id: EMAIL, password: PW } })).body.token;
    userId = uid(token);
    check('P1 provisioned fresh user', !!token, `${EMAIL} (${userId})`);
    const U = `ObjectId('${userId}')`;

    const products = (await stripe.products.list({ active: true, limit: 100 })).data;
    const priceFor = async (tierId) => {
      const prod = products.find((x) => x.metadata.tier_id === tierId);
      const prices = await stripe.prices.list({ product: prod.id, active: true, limit: 100 });
      return prices.data.find((x) => x.currency === 'gbp' && x.recurring && x.recurring.interval === 'month').id;
    };
    const prices = { reader: await priceFor('reader'), learner: await priceFor('learner'), coach: await priceFor('coach') };
    check('S2 resolved GBP price ids', !!(prices.reader && prices.learner && prices.coach), Object.values(prices).join(', '));

    const cust = await stripe.customers.create({ email: EMAIL, metadata: { userId } });
    customer = cust.id;
    mongo(`db.stripe_customers.deleteMany({user_id:'${userId}'}); db.stripe_customers.insertOne({user_id:'${userId}', customer_id:'${customer}'})`);
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer });
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm.id } });
    check('S1 wired Stripe customer + card', !!customer, customer);

    // ---- Step 0: Starter baseline + gate exercises ----
    log('\n== Step 0 — Starter (free) ==');
    const s0 = await details(); // also creates the free_credit allocation
    check('Step0 is_freemium', s0?.is_freemium === true, `tier=${s0?.tier}`);
    check('Step0 allowed_save_words=200', s0?.allowed_save_words === 200, String(s0?.allowed_save_words));
    check('Step0 voice_minutes_total=5', s0?.voice_minutes_total === 5, String(s0?.voice_minutes_total));
    check('Step0 total_credits=5,000,000', s0?.total_credits === 5000000, String(s0?.total_credits));
    check('Step0 weekly_insights LOCKED', isLimit(await call('getUserStatistic'), 'weekly_insights'));
    check('Step0 session_history LOCKED', isLimit(await call('list-live-sessions'), 'session_history'));

    const bundleId = mongo(`db.phrase_bundles.insertOne({refId:'${userId}',title:'e2e',createdAt:new Date(),updatedAt:new Date()}).insertedId.toString()`).replace(/[^a-f0-9]/gi, '');
    mongo(`db.free_credits.updateOne({user_id:${U}},{$set:{allowed_save_words_used:199}})`);
    const mk = (w) => call('createPhrase', { phrase: w, translation: w, translation_language: 'es', bundleIds: [bundleId], refId: userId });
    const c1 = await mk('alpha'); const c2 = await mk('beta');
    check('Step0 save_words: 200th save OK', c1.status === 200, `status ${c1.status}`);
    check('Step0 save_words: 201st BLOCKED', isLimit(c2, 'save_words'), `status ${c2.status}`);

    mongo(`db.free_credits.updateOne({user_id:${U}},{$set:{allowed_lived_sessions_used:3}})`);
    check('Step0 live_sessions BLOCKED at 3', isLimit(await call('request-gemini-live-session-ephemeral-token', { instructions: 'hi' }), 'live_sessions'));

    mongo(`db.free_credits.updateOne({user_id:${U}},{$set:{voice_minutes_used:5}})`);
    check('Step0 voice_minutes BLOCKED when exhausted', isLimit(await call('request-gemini-live-session-ephemeral-token', { instructions: 'hi' }), 'voice_minutes'));

    mongo(`db.free_credits.updateOne({user_id:${U}},{$set:{credits_used:5000000}})`);
    const ai = await call('create-text-session', { instructions: 'hi' });
    check('Step0 AI credits EXHAUSTED blocks AI', ai.status === 400 && String(ai.body?.message).includes('AI_CREDIT_EXHAUSTED'), `status ${ai.status}`);

    await call('clearSubscriptionAndFreemium'); // reset seeded usage before the paid ladder

    // ---- Steps 1-3: each tier (create -> grant -> exercises -> cancel -> revert) ----
    const tierTests = [
      { tier: 'reader', price: prices.reader, credits: 200000000, voice: 0, insights: false },
      { tier: 'learner', price: prices.learner, credits: 300000000, voice: 90, insights: true },
      { tier: 'coach', price: prices.coach, credits: 600000000, voice: 300, insights: true },
    ];
    for (const tt of tierTests) {
      log(`\n== ${tt.tier.toUpperCase()} ==`);
      const sub = await stripe.subscriptions.create({ customer, items: [{ price: tt.price }] });
      const d = await awaitTier(tt.tier);
      check(`${tt.tier}: grant tier`, d && d.tier === tt.tier, d ? d.tier : 'no grant (webhook?)');
      if (d) {
        check(`${tt.tier}: total_credits=${tt.credits}`, d.total_credits === tt.credits, String(d.total_credits));
        check(`${tt.tier}: voice_minutes_total=${tt.voice}`, d.voice_minutes_total === tt.voice, String(d.voice_minutes_total));
        check(`${tt.tier}: entitlements.weeklyInsights=${tt.insights}`, d.entitlements && d.entitlements.weeklyInsights === tt.insights, String(d.entitlements && d.entitlements.weeklyInsights));
        const wi = await call('getUserStatistic'); const sh = await call('list-live-sessions');
        if (tt.insights) {
          check(`${tt.tier}: weekly_insights UNLOCKED`, wi.status === 200, `status ${wi.status}`);
          check(`${tt.tier}: session_history UNLOCKED`, sh.status === 200, `status ${sh.status}`);
        } else {
          check(`${tt.tier}: weekly_insights LOCKED`, isLimit(wi, 'weekly_insights'));
          check(`${tt.tier}: session_history LOCKED`, isLimit(sh, 'session_history'));
        }
        if (tt.voice === 0) {
          check(`${tt.tier}: voice BLOCKED (granted 0)`, isLimit(await call('request-gemini-live-session-ephemeral-token', { instructions: 'hi' }), 'voice_minutes'));
        } else {
          await call('debit-voice-minutes', { seconds: tt.voice * 60 });
          check(`${tt.tier}: voice BLOCKED after debiting ${tt.voice}m`, isLimit(await call('request-gemini-live-session-ephemeral-token', { instructions: 'hi' }), 'voice_minutes'));
        }
      }
      await stripe.subscriptions.cancel(sub.id);
      check(`${tt.tier}: cancel reverts to Starter`, !!(await awaitTier('free')), 'is_freemium=true');
    }
    log('\n== Done ==');
  } catch (e) {
    check('runner completed without throwing', false, String((e && e.stack) || e));
  } finally {
    log('\n== Teardown ==');
    try {
      if (customer) {
        const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
        for (const s of subs.data) if (s.status !== 'canceled') await stripe.subscriptions.cancel(s.id);
      }
    } catch {}
    try {
      if (userId) mongo(`db.subscriptions.deleteMany({user_id:ObjectId('${userId}')});db.free_credits.deleteMany({user_id:ObjectId('${userId}')});db.usages.deleteMany({user_id:ObjectId('${userId}')});db.stripe_customers.deleteMany({user_id:'${userId}'});db.phrases.deleteMany({refId:'${userId}'});db.phrase_bundles.deleteMany({refId:'${userId}'})`);
    } catch (e) { log('teardown mongo error: ' + e); }
    log('teardown done');

    const pass = results.filter((r) => r.pass).length;
    const fail = results.filter((r) => !r.pass);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.resolve(__dirname, '../../agent-tests/_runs');
    fs.mkdirSync(dir, { recursive: true });
    const md = [
      `# tier-ladder run — ${new Date().toISOString()}`, '',
      `- subject: ${EMAIL} (${userId})`, `- stripe customer: ${customer}`,
      `- **${pass} passed, ${fail.length} failed** of ${results.length}`, '',
      '| result | check | detail |', '| --- | --- | --- |',
      ...results.map((r) => `| ${r.pass ? '✓ pass' : '✗ FAIL'} | ${r.name} | ${(r.detail || '').replace(/\|/g, '\\|').slice(0, 200)} |`),
    ].join('\n');
    fs.writeFileSync(path.join(dir, `${stamp}.md`), md);
    log(`\nReport: agent-tests/_runs/${stamp}.md`);
    log(`SUMMARY: ${pass} passed, ${fail.length} failed of ${results.length}`);
    process.exit(fail.length ? 1 : 0);
  }
})();
