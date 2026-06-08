# Helpers — reusable recipes

Concrete recipes the specs reference. Commands assume `BASE=http://localhost:8080`,
the `subturtle_dev_` Mongo prefix, and a `sk_test_…` `STRIPE_SECRET_KEY` in
`server/.env`. The agent should adapt literals (ids, prefix) to the live env.

`H=(-H 'Content-Type: application/json' -H 'Origin: http://localhost:3000')`

---

## P1 · Provision a fresh test user → `{ token, userId }`

```bash
EMAIL="e2e+$(date +%s)@example.com"; PW='Test1234!'
curl -s "${H[@]}" "$BASE/user/register_id"     -d "{\"idType\":\"email\",\"id\":\"$EMAIL\"}"      >/dev/null
curl -s "${H[@]}" "$BASE/user/validateCode"    -d "{\"idType\":\"email\",\"id\":\"$EMAIL\",\"code\":\"123456\"}" >/dev/null
curl -s "${H[@]}" "$BASE/user/submit_password" -d "{\"idType\":\"email\",\"id\":\"$EMAIL\",\"password\":\"$PW\",\"code\":\"123456\"}" >/dev/null
TOKEN=$(curl -s "${H[@]}" "$BASE/user/login" -d "{\"idType\":\"email\",\"id\":\"$EMAIL\",\"password\":\"$PW\"}" | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
```
`userId` = the `id` claim in the JWT (decode the middle segment), or read it from
`subturtle_dev_cms.auths` by email.

Helper to call an RPC as the user. **`user_access` RPCs require `userId` in `args`**
— the framework does NOT inject it (omitting it throws "User ID is required" or
silently mis-resolves to a random id). So every `args` below includes `"userId"`.
```bash
rpc(){ curl -s -w "\n%{http_code}" "${H[@]}" "$BASE/function/run" -H "authorization: $TOKEN" -d "$1"; }
# e.g. rpc "{\"name\":\"getSubscriptionDetails\",\"args\":{\"userId\":\"$USERID\"}}"
```
Success → `{"status":"success","data":<payload>}`; a blocked call → HTTP 400
`{"status":"error","message":"TIER_LIMIT_REACHED: …"}`. (Read the payload from `.data`.)

## P2 · Read current state

```bash
rpc '{"name":"getSubscriptionDetails","args":{}}'   # -> tier, is_freemium, caps, voice_minutes_*, entitlements (paid)
```

## S1 · Wire the user to a Stripe customer

The webhook maps customer→user via the `stripe_customers` collection. Create the
mapping once by issuing a checkout session (it calls `getOrCreateStripeCustomer`):
```bash
rpc '{"name":"createCustomCheckoutSession","args":{"tierId":"reader","cadence":"monthly","successUrl":"http://localhost:3000/#/payment-success"}}'
```
Then read the customer id:
```bash
mongosh "$MONGO/subturtle_dev_user_content" --quiet --eval \
  'JSON.stringify(db.stripe_customers.findOne({user_id:"<USERID-as-string>"}))'
```

## S2 · Resolve a tier's GBP price id (Stripe API)

```js
// node -e (with stripe + dotenv from server/) — for tierId/cadence:
const products = await stripe.products.list({active:true, limit:100});
const p = products.data.find(x => x.metadata.tier_id === tierId);
const prices = await stripe.prices.list({product:p.id, active:true, limit:100});
const price = prices.data.find(x => x.currency==='gbp' && x.recurring.interval===(cadence==='annual'?'year':'month'));
// price.id
```

## S3 · Create / upgrade / cancel a subscription (Stripe API, test mode)

```js
// create (fires customer.subscription.created -> grant)
const sub = await stripe.subscriptions.create({
  customer: CUSTOMER, items:[{price: PRICE_ID}],
  default_payment_method:'pm_card_visa',
  // for Learner trial coverage, add: trial_period_days: <from metadata>
});
// UPGRADE in place (fires customer.subscription.updated -> refill to new tier)
await stripe.subscriptions.update(sub.id, { items:[{ id: sub.items.data[0].id, price: NEXT_PRICE_ID }] });
// CANCEL (fires customer.subscription.deleted -> revert to Starter)
await stripe.subscriptions.cancel(sub.id);
```
> `pm_card_visa` is Stripe's always-succeeds test PM (no 3DS). Use a **test clock**
> to advance a trial to active / force a renewal deterministically.

## A1 · Await the async grant (poll — never assert immediately)

```bash
for i in $(seq 1 30); do
  T=$(rpc '{"name":"getSubscriptionDetails","args":{}}' | head -1 | node -pe "JSON.parse(require('fs').readFileSync(0)).tier")
  [ "$T" = "$EXPECT_TIER" ] && break; sleep 1
done
```
If the tier never changes, the grant didn't fire → check `stripe listen` is running
and the server webhook log.

---

## Feature exercisers (boundary)

Exercise each gate at its boundary. To avoid 200 real saves / real Gemini calls,
**seed usage to `cap-1` via Mongo**, then make ONE call to cross the line. `U` =
`ObjectId("<USERID>")`.

### E·save_words (free cap 200)
```bash
# seed used = 199, then two creates: 1st ok, 2nd blocked at 200
mongosh "$MONGO/subturtle_dev_user_content" --quiet --eval 'db.free_credits.updateOne({user_id:U},{$set:{allowed_save_words_used:199}})'
# need a bundle to save into: create one, capture BUNDLE_ID, then:
rpc '{"name":"createPhrase","args":{"phrase":"alpha","translation":"a","translation_language":"es","bundleIds":["BUNDLE_ID"],"refId":"<USERID>"}}'  # 200 -> ok
rpc '{"name":"createPhrase","args":{"phrase":"beta","translation":"b","translation_language":"es","bundleIds":["BUNDLE_ID"],"refId":"<USERID>"}}'   # 400 TIER_LIMIT_REACHED "save_words"
```
On a paid tier the same two calls both succeed (cap = ∞).

### E·weekly_insights / E·session_history (boolean lock)
```bash
rpc '{"name":"getUserStatistic","args":{}}'      # free/Reader -> 400 "weekly_insights"; Learner/Coach -> 200 {totalPhrases,totalBundles}
rpc '{"name":"list-live-sessions","args":{}}'    # free/Reader -> 400 "session_history"; Learner/Coach -> 200 {items,total,pages}
```

### E·live_sessions (free count 3)
```bash
mongosh "$MONGO/subturtle_dev_user_content" --quiet --eval 'db.free_credits.updateOne({user_id:U},{$set:{allowed_lived_sessions_used:3}})'
rpc '{"name":"request-gemini-live-session-ephemeral-token","args":{"instructions":"hi"}}'  # 400 "live_sessions" (gate is BEFORE the Gemini call)
```

### E·voice_minutes
```bash
# Reader (granted 0): token request blocked immediately
rpc '{"name":"request-gemini-live-session-ephemeral-token","args":{"instructions":"hi"}}'  # Reader -> 400 "voice_minutes"
# Debit + boundary (any tier): drive used up to total, then block
rpc '{"name":"debit-voice-minutes","args":{"seconds":5400}}'   # 90 min -> Learner budget exhausted
rpc '{"name":"request-gemini-live-session-ephemeral-token","args":{"instructions":"hi"}}'  # 400 "voice_minutes"
```

### E·AI credits (tier-scaled budget)
```bash
mongosh "$MONGO/subturtle_dev_user_content" --quiet --eval 'db.subscriptions.updateOne({user_id:U,status:{$nin:["canceled","incomplete_expired"]}},[{$set:{credits_used:"$total_credits"}}])'
rpc '{"name":"create-text-session","args":{"instructions":"hi"}}'   # 400 AI_CREDIT_EXHAUSTED
```
(For free users seed `free_credits.credits_used = total_credits` instead.)

---

## T1 · Teardown (always)

```js
// cancel any live Stripe subs for the customer
const subs = await stripe.subscriptions.list({customer: CUSTOMER, status:'all'});
for (const s of subs.data) if (s.status!=='canceled') await stripe.subscriptions.cancel(s.id);
```
```bash
mongosh "$MONGO/subturtle_dev_user_content" --quiet --eval '
  db.subscriptions.deleteMany({user_id:U}); db.free_credits.deleteMany({user_id:U});
  db.usages.deleteMany({user_id:U}); db.stripe_customers.deleteMany({user_id:"<USERID>"});
  db.phrases.deleteMany({refId:"<USERID>"}); db.phrase_bundles.deleteMany({refId:"<USERID>"});'
mongosh "$MONGO/subturtle_dev_cms" --quiet --eval 'db.auths.deleteMany({email:/^e2e\+/})'
```
> RPC `clearSubscriptionAndFreemium {userId}` clears `subscriptions`+`free_credits`+`usages`
> but NOT the Stripe sub or `stripe_customers` — cancel the Stripe sub explicitly.
