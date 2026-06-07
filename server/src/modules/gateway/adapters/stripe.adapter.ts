import { getCollection, userManager } from "@modular-rest/server";
import Stripe from "stripe";
import {
  DATABASE,
  PAYMENT_COLLECTION,
  PAYMENT_SESSION_COLLECTION,
} from "../../../config";
import {
  addNewSubscriptionWithCredit,
  addVoiceMinutesPack,
  cancelSubscriptionByProviderAndSubscriptionId,
  updateSubscriptionStatusByProviderAndSubscriptionId,
} from "../../subscription/service";
import {
  CreateCheckoutRequest,
  CheckoutSessionResult,
  PaymentAdapter,
  PaymentProvider,
  PaymentVerificationResult,
} from "./types";
import { PaymentSession } from "../types";
import { Cadence } from "../../subscription/tiers";
import {
  resolveEntitlements,
  resolveTierCheckout,
  resolvePackCheckout,
  clearEntitlementsCache,
  cachedTierName,
  Entitlements,
} from "../../subscription/entitlements";
import { clearPlansCache } from "../../subscription/plans";
import {
  trackServerEvent,
  SERVER_ANALYTICS_EVENTS,
} from "../../../utils/analytics";

/**
 * Stripe payment adapter implementation
 */
export class StripeAdapter implements PaymentAdapter {
  readonly provider = PaymentProvider.STRIPE;
  stripe: Stripe;

  constructor(private apiKey: string) {
    this.stripe = new Stripe(apiKey);
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    // Nothing special to initialize for Stripe
    if (!this.apiKey) {
      throw new Error("Stripe API key is required");
    }
  }

  /**
   * Helper to get or create a Stripe customer for a user
   */
  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    // Get the stripe_customer collection
    const stripeCustomerCollection = getCollection(DATABASE, "stripe_customer");
    // Try to find an existing mapping
    const record = await stripeCustomerCollection.findOne({ user_id: userId });
    const storedCustomerId = record?.get("customer_id");

    if (storedCustomerId) {
      // Verify the stored customer still exists in Stripe — it may have been
      // deleted out-of-band. If so, fall through and create a fresh one so the
      // mapping self-heals instead of failing every checkout/portal call.
      try {
        const existing = await this.stripe.customers.retrieve(storedCustomerId);
        if (!(existing as any).deleted) {
          return storedCustomerId;
        }
      } catch (err: any) {
        if (err?.code !== "resource_missing") throw err;
        // resource_missing => the customer was deleted; recreate below.
      }
    }

    const user = await userManager.getUserById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Create a new Stripe customer
    const customer = await this.stripe.customers.create({
      description: `User ${userId}`,
      email: user.email,
      metadata: { userId },
    });

    // Store the mapping
    await stripeCustomerCollection.updateOne(
      { user_id: userId },
      { $set: { user_id: userId, customer_id: customer.id } },
      { upsert: true }
    );
    return customer.id;
  }

  /**
   * Look up our internal userId for a Stripe customer ID, or null if unknown.
   */
  private async getUserIdForCustomer(
    customerId: string
  ): Promise<string | null> {
    const stripeCustomerCollection = getCollection<any>(
      DATABASE,
      "stripe_customer"
    );
    const record = await stripeCustomerCollection.findOne({
      customer_id: customerId,
    });
    return record?.user_id || null;
  }

  /**
   * Create a checkout session for Stripe
   */
  async createCheckoutSession(
    request: CreateCheckoutRequest
  ): Promise<CheckoutSessionResult> {
    const { userId, tierId, cadence, successUrl, cancelUrl } = request;

    // Resolve the single GBP price + entitlements for this tier/cadence LIVE from
    // Stripe — product metadata is the source of truth (ADR-004). Non-GBP
    // customers are shown their local currency by Stripe Adaptive Pricing; we
    // always charge against the GBP base price and settle in GBP.
    const { priceId, productId, entitlements, unitAmount, currency } =
      await resolveTierCheckout(this.stripe, tierId, cadence);

    // Ensure Stripe customer exists for this user
    const customerId = await this.getOrCreateStripeCustomer(userId);

    const sessionMetadata: Record<string, string> = {
      userId,
      tierId,
      cadence,
      priceId,
      creditsAmount: entitlements.creditsGranted.toString(),
      voiceMinutes: entitlements.voiceMinutesGranted.toString(),
      subscriptionDays: entitlements.durationDays.toString(),
    };

    // The trial is credit-card-required: `payment_method_collection: "always"`
    // forces card collection even though the subscription starts in a trial.
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
      { metadata: sessionMetadata };
    if (entitlements.trialDays) {
      subscriptionData.trial_period_days = entitlements.trialDays;
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      customer: customerId,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      payment_method_collection: "always",
      subscription_data: subscriptionData,
      metadata: sessionMetadata,
    });

    // Save session in database. With Adaptive Pricing the customer pays in their
    // local (presentment) currency, but we record the GBP SETTLEMENT amount +
    // currency (the base price) — our reports, refunds, proration, and the
    // webhook all work in GBP.
    const paymentSessionCollection = getCollection(
      DATABASE,
      PAYMENT_SESSION_COLLECTION
    );

    await paymentSessionCollection.updateOne(
      { "provider_data.session_id": session.id },
      {
        $set: {
          user_id: userId,
          provider: this.provider,
          amount: unitAmount ? unitAmount / 100 : 0,
          currency, // gbp (settlement)
          status: "created",
          provider_data: {
            session_id: session.id,
            price_id: priceId,
            product_id: productId,
            expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: session.metadata || {},
          },
        },
      },
      { upsert: true }
    );

    return {
      sessionId: session.id,
      url: session.url || "",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      provider: this.provider,
      metadata: session.metadata || {},
    };
  }

  /**
   * Create an EMBEDDED Custom Checkout session (ui_mode: "custom") for in-app
   * checkout with Stripe Adaptive Pricing. Returns a client secret that the
   * frontend Checkout Elements SDK uses to render the payment UI AND read the
   * localized (presentment-currency) amount to display — while we still settle in
   * GBP. This replaces the hosted redirect for the purchase flow.
   */
  async createCustomCheckoutSession(
    request: CreateCheckoutRequest
  ): Promise<{ clientSecret: string; sessionId: string }> {
    const { userId, tierId, cadence, successUrl } = request;

    const { priceId, productId, entitlements, unitAmount, currency } =
      await resolveTierCheckout(this.stripe, tierId, cadence);

    const customerId = await this.getOrCreateStripeCustomer(userId);

    const sessionMetadata: Record<string, string> = {
      userId,
      tierId,
      cadence,
      priceId,
      creditsAmount: entitlements.creditsGranted.toString(),
      voiceMinutes: entitlements.voiceMinutesGranted.toString(),
      subscriptionDays: entitlements.durationDays.toString(),
    };

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
      { metadata: sessionMetadata };
    if (entitlements.trialDays) {
      subscriptionData.trial_period_days = entitlements.trialDays;
    }

    const session = await this.stripe.checkout.sessions.create({
      ui_mode: "custom",
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: subscriptionData,
      // Adaptive Pricing: show the customer their local currency at checkout;
      // we settle and report in GBP.
      adaptive_pricing: { enabled: true },
      // ui_mode "custom" requires a return_url for redirect-based payment methods.
      return_url: `${successUrl || ""}?session_id={CHECKOUT_SESSION_ID}`,
      metadata: sessionMetadata,
    });

    // Record the GBP SETTLEMENT amount/currency (same as the hosted path).
    const paymentSessionCollection = getCollection(
      DATABASE,
      PAYMENT_SESSION_COLLECTION
    );
    await paymentSessionCollection.updateOne(
      { "provider_data.session_id": session.id },
      {
        $set: {
          user_id: userId,
          provider: this.provider,
          amount: unitAmount ? unitAmount / 100 : 0,
          currency, // gbp (settlement)
          status: "created",
          provider_data: {
            session_id: session.id,
            price_id: priceId,
            product_id: productId,
            expires_at: new Date(Date.now() + 30 * 60 * 1000),
            success_url: successUrl,
            metadata: session.metadata || {},
          },
        },
      },
      { upsert: true }
    );

    if (!session.client_secret) {
      throw new Error(
        "Stripe did not return a client_secret for the custom checkout session"
      );
    }
    return { clientSecret: session.client_secret, sessionId: session.id };
  }

  /**
   * Create a HOSTED one-shot checkout for a voice-minute top-up pack (Council 004
   * overage). Returns the Stripe-hosted URL to open in a new tab; on completion the
   * `checkout.session.completed` webhook (mode "payment") grants the minutes via
   * addVoiceMinutesPack. Adaptive Pricing localizes the displayed currency; we
   * settle in GBP.
   */
  async createVoiceTopUpCheckoutSession(request: {
    userId: string;
    packKey: string;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ url: string; sessionId: string }> {
    const { userId, packKey, successUrl, cancelUrl } = request;
    const { priceId } = await resolvePackCheckout(this.stripe, packKey);
    const customerId = await this.getOrCreateStripeCustomer(userId);

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_types: ["card"],
      adaptive_pricing: { enabled: true },
      success_url: successUrl || "",
      cancel_url: cancelUrl || successUrl || "",
      // userId is read by the top-up webhook; kind/pack_key are belt-and-suspenders
      // (the webhook also derives minutes from the product metadata).
      metadata: { userId, kind: "voice_topup", pack_key: packKey },
    });

    return { url: session.url || "", sessionId: session.id };
  }

  /**
   * Verify payment status with Stripe
   */
  async verifyPayment(sessionId: string): Promise<PaymentVerificationResult> {
    try {
      // Check if payment session exists in our database
      const paymentSessionCollection = getCollection<PaymentSession>(
        DATABASE,
        PAYMENT_SESSION_COLLECTION
      );
      const session = await paymentSessionCollection.findOne({
        "provider_data.session_id": sessionId,
      });

      if (!session) {
        throw new Error("Payment session not found");
      }

      // Check payment status with Stripe
      const checkoutSession = await this.stripe.checkout.sessions.retrieve(
        sessionId
      );

      if (checkoutSession.payment_status !== "paid") {
        throw new Error("Payment not completed");
      }

      // If already processed, return success
      if (session.status === "completed") {
        const paymentCollection = getCollection(DATABASE, PAYMENT_COLLECTION);
        // Type assertion for payment document
        const payment = (await paymentCollection.findOne({
          "provider_data.session_id": sessionId,
        })) as any;

        return {
          success: true,
          paymentId: payment?._id.toString(),
          status: "succeeded",
          metadata: payment?.metadata || {},
        };
      }

      // Update session status
      await paymentSessionCollection.updateOne(
        { _id: session._id },
        { $set: { status: "completed" } }
      );

      // Create payment record
      const paymentCollection = getCollection(DATABASE, PAYMENT_COLLECTION);

      // Update a payment record
      await paymentCollection.updateOne(
        { "provider_data.session_id": sessionId },
        {
          $set: {
            user_id: session.user_id,
            provider: this.provider,
            amount: session.amount,
            currency: session.currency,
            status: "succeeded",
            provider_data: {
              session_id: sessionId,
              invoice_id: checkoutSession.invoice as string,
              payment_id: checkoutSession.payment_intent as string,
              customer_id: checkoutSession.customer,
              product_id: session.provider_data.product_id,
              subscription_id: checkoutSession.subscription as string,
              metadata: checkoutSession.metadata || {},
            },
          },
        },
        // Upsert the payment record
        {
          upsert: true,
        }
      );

      return {
        success: true,
        status: "succeeded",
        metadata: checkoutSession.metadata || {},
      };
    } catch (error: any) {
      console.error("Payment verification error:", error);
      throw new Error(error.message || "Unknown error occurred");
    }
  }

  /**
   * Resolve the current billing period bounds (unix seconds) from a subscription
   * webhook payload, robust to Stripe's API-version drift.
   *
   * `current_period_start` / `current_period_end` moved off the Subscription
   * object and onto the subscription ITEM in API version 2025-03-31.basil. A
   * webhook event is serialized with the account's API version, which may still
   * be older (e.g. 2024-10-28.acacia) where these fields live on the
   * subscription. Read item-first and fall back to the subscription so we always
   * get a real period regardless of the delivering version.
   *
   * This matters because an undefined end flows into `new Date(end * 1000)` ===
   * `new Date(NaN)` — an Invalid Date that every active-subscription query
   * (`end_date: { $gte: new Date() }`) silently filters out. The grant would then
   * persist but never take effect: the webhook returns 200, yet the tier never
   * applies and it looks like a no-op.
   */
  private periodBoundsUnix(
    subscription: Stripe.Subscription,
    item: Stripe.SubscriptionItem
  ): { start: number; end: number } {
    const sub = subscription as any;
    return {
      start: item.current_period_start ?? sub.current_period_start,
      end: item.current_period_end ?? sub.current_period_end,
    };
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(
    eventData: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const event = eventData as Stripe.Event;

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;

          // One-shot voice top-up packs use mode "payment" (tier subscriptions use
          // mode "subscription" and grant in customer.subscription.created). Route
          // them to the top-up grant; everything else keeps the payment-record path.
          if (session.mode === "payment") {
            return await this.handleVoiceTopUpCheckout(session);
          }

          const metadata = session.metadata;

          // Skip if no metadata (shouldn't happen)
          if (!metadata || !metadata.userId) {
            return { success: false, message: "Missing metadata in session" };
          }

          // Verify payment and add credits
          await this.verifyPayment(session.id);
          return { success: true, message: "Payment processed successfully" };
        }

        case "customer.subscription.created": {
          const subscription = event.data.object as Stripe.Subscription;

          // 1. Resolve our userId from the Stripe customer.
          const userId = await this.getUserIdForCustomer(
            subscription.customer as string
          );
          if (!userId) {
            return {
              success: false,
              message: "User not found for this customer",
            };
          }

          // 2. Read entitlements from the product metadata — the source of
          //    truth for credits + voice minutes (ADR-004).
          const item = subscription.items.data[0];
          const priceId = item.price.id;
          let entitlements: Entitlements;
          try {
            entitlements = await resolveEntitlements(this.stripe, { priceId });
          } catch (err: any) {
            // Fail safe = REFUSE, not guess: reject so Stripe retries + alert.
            return this.refuseEntitlementGrant(userId, priceId, err);
          }
          const cadence: Cadence =
            item.price.recurring?.interval === "year" ? "annual" : "monthly";

          // The card label is the Stripe product NAME (source of truth), cached by
          // the resolveEntitlements call above; fall back to the capitalized tier id.
          const tierLabel =
            cachedTierName({ priceId }) ||
            entitlements.tierId.charAt(0).toUpperCase() +
              entitlements.tierId.slice(1);

          // 3. Grant from the parsed metadata, snapshotting it onto the doc and
          //    marking the granted period. A trialing subscription still gets the
          //    full budget so the trial unlocks the tier. Idempotent on
          //    (subscription id, period).
          const { start: periodStart, end: periodEnd } =
            this.periodBoundsUnix(subscription, item);
          // TEMP DIAG (e2e tier-ladder) — remove once the grant period is fixed.
          console.log(
            "[e2e-diag.created] " +
              JSON.stringify({
                status: subscription.status,
                itemEnd: (item as any).current_period_end,
                subEnd: (subscription as any).current_period_end,
                bca: (subscription as any).billing_cycle_anchor,
                startDate: (subscription as any).start_date,
                periodStart,
                periodEnd,
                itemKeys: Object.keys(item || {}),
                subKeys: Object.keys(subscription || {}),
              })
          );
          const grant = await addNewSubscriptionWithCredit({
            userId,
            creditAmount: entitlements.creditsGranted,
            voiceMinutes: entitlements.voiceMinutesGranted,
            startDateUnixTimestamp: periodStart,
            endDateUnixTimestamp: periodEnd,
            grantedPeriodEndUnixTimestamp: periodEnd,
            stripeSubscriptionId: subscription.id,
            tier: entitlements.tierId,
            subscriptionType: cadence,
            priceId,
            status: subscription.status,
            trialEndUnixTimestamp: subscription.trial_end ?? undefined,
            entitlements,
            paymentMetaData: {
              provider: this.provider,
              stripe: {
                label: tierLabel,
                subscription_id: subscription.id,
              },
            },
          });

          // Server-truth lifecycle events — only on a genuinely NEW grant.
          // A redelivered "created" webhook is idempotent in the DB
          // (isNewSubscription:false); firing here unconditionally would
          // double-count it in Mixpanel. A subscription that starts as
          // "trialing" is a trial start; one that starts "active" (no trial,
          // e.g. a returning customer) is a direct paid start.
          if (grant.isNewSubscription) {
            if (subscription.status === "trialing") {
              trackServerEvent(SERVER_ANALYTICS_EVENTS.TRIAL_STARTED, userId, {
                cadence,
                tier: entitlements.tierId,
              });
            } else if (subscription.status === "active") {
              trackServerEvent(
                SERVER_ANALYTICS_EVENTS.SUBSCRIPTION_STARTED,
                userId,
                { cadence, tier: entitlements.tierId, via_trial: false }
              );
            }
          }

          return {
            success: true,
            message: "Subscription created successfully",
          };
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;

          try {
            const { success, message, wasTrialing } =
              await cancelSubscriptionByProviderAndSubscriptionId({
                provider: this.provider,
                subscriptionId: subscription.id,
                status: subscription.status,
              });

            // Fire the server-truth event only when the cancel actually
            // applied to a subscription we hold (success). A delete webhook for
            // a subscription not in our DB returns success:false — recording it
            // would be a phantom cancellation. `was_trialing` separates trial
            // drop-offs from real paid churn.
            const userId = await this.getUserIdForCustomer(
              subscription.customer as string
            );
            if (userId && success) {
              trackServerEvent(
                SERVER_ANALYTICS_EVENTS.SUBSCRIPTION_CANCELED,
                userId,
                { was_trialing: !!wasTrialing }
              );
            }

            return {
              success,
              message,
            };
          } catch (error: any) {
            return {
              success: false,
              message: error.message || "Unknown error occurred",
            };
          }
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const item = subscription.items.data[0];
          const priceId = item.price.id;

          // Read entitlements from the product metadata so a real period
          // rollover (renewal, or the trial->paid transition) refills the correct
          // credit + voice budget from the metadata current at renewal time.
          let entitlements: Entitlements;
          try {
            entitlements = await resolveEntitlements(this.stripe, { priceId });
          } catch (err: any) {
            const userId = await this.getUserIdForCustomer(
              subscription.customer as string
            );
            return this.refuseEntitlementGrant(userId, priceId, err);
          }
          const cadence: Cadence =
            item.price.recurring?.interval === "year" ? "annual" : "monthly";

          // Keep the card label (Stripe product NAME) in sync so an upgrade shows
          // the new tier's name, not the one captured at creation.
          const tierLabel =
            cachedTierName({ priceId }) ||
            entitlements.tierId.charAt(0).toUpperCase() +
              entitlements.tierId.slice(1);

          const { start: periodStart, end: periodEnd } =
            this.periodBoundsUnix(subscription, item);
          const { success, message, previousStatus } =
            await updateSubscriptionStatusByProviderAndSubscriptionId({
              provider: this.provider,
              subscriptionId: subscription.id,
              status: subscription.status,
              startDateUnixTimestamp: periodStart,
              endDateUnixTimestamp: periodEnd,
              tier: entitlements.tierId,
              subscriptionType: cadence,
              priceId,
              label: tierLabel,
              creditAmount: entitlements.creditsGranted,
              voiceMinutes: entitlements.voiceMinutesGranted,
              entitlements,
              trialEndUnixTimestamp: subscription.trial_end ?? undefined,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });

          // A subscription "starts" the first time it becomes active from a
          // non-active local state. Driving this off OUR stored prior status
          // (not Stripe's previous_attributes) makes it idempotent — a
          // redelivered webhook sees the record already "active" and won't
          // re-fire — and it covers both start paths:
          //   trialing   -> active : a trial converted to paid (via_trial: true)
          //   incomplete -> active : an SCA/3DS paid start clearing (via_trial: false)
          if (
            success &&
            subscription.status === "active" &&
            (previousStatus === "trialing" || previousStatus === "incomplete")
          ) {
            const userId = await this.getUserIdForCustomer(
              subscription.customer as string
            );
            if (userId) {
              trackServerEvent(
                SERVER_ANALYTICS_EVENTS.SUBSCRIPTION_STARTED,
                userId,
                {
                  cadence,
                  tier: entitlements.tierId,
                  via_trial: previousStatus === "trialing",
                }
              );
            }
          }

          return {
            success,
            message,
          };
        }

        // A Stripe edit to a product or price may change entitlements or display
        // pricing. Drop the entitlement + plans caches so the next read
        // re-fetches, instead of waiting for the TTL (ADR-004 cache-invalidation).
        case "product.created":
        case "product.updated":
        case "product.deleted": {
          const product = event.data.object as Stripe.Product;
          clearEntitlementsCache(product.id);
          clearPlansCache();
          return { success: true, message: `Caches cleared (${event.type})` };
        }

        case "price.created":
        case "price.updated":
        case "price.deleted": {
          const price = event.data.object as Stripe.Price;
          const productId =
            typeof price.product === "string"
              ? price.product
              : (price.product as Stripe.Product | undefined)?.id;
          clearEntitlementsCache(productId);
          clearPlansCache();
          return { success: true, message: `Caches cleared (${event.type})` };
        }

        // Handle other webhook events here
        default: {
          return {
            success: true,
            message: `Unhandled event type: ${event.type}`,
          };
        }
      }
    } catch (error: any) {
      console.error("Webhook error:", error);
      return {
        success: false,
        message: error.message || "Unknown error occurred",
      };
    }
  }

  /**
   * Fail-safe refusal (ADR-004): a Stripe product's entitlement metadata was
   * missing or invalid, so we refuse to grant rather than guess an amount or
   * silently drop the user to free. Returning failure makes the webhook respond
   * non-2xx, so Stripe retries — buying time for a human to fix the metadata.
   * Loud log + analytics alert.
   */
  private refuseEntitlementGrant(
    userId: string | null,
    priceId: string,
    err: any
  ): { success: boolean; message: string } {
    const message = `Refusing entitlement grant: invalid metadata for Stripe price ${priceId}: ${
      err?.message || err
    }`;
    console.error(`[ALERT] ${message}`);
    if (userId) {
      trackServerEvent(
        SERVER_ANALYTICS_EVENTS.ENTITLEMENT_GRANT_REFUSED,
        userId,
        { priceId, error: err?.message || String(err) }
      );
    }
    return { success: false, message };
  }

  /**
   * Grant a one-shot voice-minute top-up pack on checkout.session.completed.
   * The pack product is identified by its Stripe metadata (`kind: "voice_topup"`,
   * seeded by setup:stripe); the minutes + 90-day expiry come from that metadata —
   * the source of truth. Idempotent on the checkout session id (the service guards
   * the ledger), so a redelivered webhook never double-grants.
   */
  private async handleVoiceTopUpCheckout(
    session: Stripe.Checkout.Session
  ): Promise<{ success: boolean; message: string }> {
    // Only grant once the one-shot payment actually settled.
    if (session.payment_status && session.payment_status !== "paid") {
      return { success: true, message: "Top-up not paid yet; ignored" };
    }

    // Resolve the purchased product to read its top-up metadata (source of truth).
    const lineItems = await this.stripe.checkout.sessions.listLineItems(
      session.id,
      { expand: ["data.price.product"], limit: 1 }
    );
    const product = lineItems.data[0]?.price?.product as
      | Stripe.Product
      | undefined;
    const md =
      product && typeof product === "object" ? product.metadata : undefined;

    if (!md || md.kind !== "voice_topup") {
      // A non-top-up one-shot payment — nothing for this handler to do.
      return { success: true, message: "Non-top-up payment ignored" };
    }

    const minutes = parseInt(md.voice_minutes || "0", 10);
    const expiryDays = parseInt(md.pack_expiry_days || "90", 10);
    if (!minutes) {
      return {
        success: false,
        message: "Top-up product is missing voice_minutes metadata",
      };
    }

    const userId =
      session.metadata?.userId ||
      (await this.getUserIdForCustomer(session.customer as string));
    if (!userId) {
      return { success: false, message: "User not found for top-up" };
    }

    const result = await addVoiceMinutesPack({
      userId,
      minutes,
      packSize: minutes,
      sessionId: session.id,
      expiryDays,
    });

    return { success: result.success, message: result.message };
  }

  public async getSubscriptionDetails(paymentId: string) {
    return this.stripe.subscriptions.retrieve(paymentId);
  }
}
