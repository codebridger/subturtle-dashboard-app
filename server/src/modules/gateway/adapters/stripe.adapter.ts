import { getCollection, userManager } from "@modular-rest/server";
import Stripe from "stripe";
import {
  DATABASE,
  PAYMENT_COLLECTION,
  PAYMENT_SESSION_COLLECTION,
} from "../../../config";
import {
  addNewSubscriptionWithCredit,
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
import { getTier, resolveTierByPriceId } from "../../subscription/tiers";
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
    const { userId, tierId, cadence, currency, successUrl, cancelUrl } =
      request;

    // Resolve the tier + Stripe price ID from the registry (the source of truth).
    const tier = getTier(tierId);
    if (!tier.isPaid || tier.status !== "live") {
      throw new Error(`Tier "${tierId}" is not available for checkout`);
    }
    const priceId = tier.prices?.[cadence]?.[currency];
    if (!priceId) {
      throw new Error(
        `No Stripe price configured for tier "${tierId}" ${cadence}/${currency}`
      );
    }

    // Ensure Stripe customer exists for this user
    const customerId = await this.getOrCreateStripeCustomer(userId);

    // Fetch the price so the payment_session record mirrors its amount/currency.
    const price = await this.stripe.prices.retrieve(priceId);

    const sessionMetadata: Record<string, string> = {
      userId,
      tierId,
      cadence,
      currency,
      priceId,
      creditsAmount: tier.creditBudget.toString(),
      subscriptionDays: tier.durationDays.toString(),
    };

    // The trial is credit-card-required: `payment_method_collection: "always"`
    // forces card collection even though the subscription starts in a trial.
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
      { metadata: sessionMetadata };
    if (tier.trialDays) {
      subscriptionData.trial_period_days = tier.trialDays;
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

    // Save session in database
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
          amount: price.unit_amount ? price.unit_amount / 100 : 0,
          currency: price.currency,
          status: "created",
          provider_data: {
            session_id: session.id,
            price_id: priceId,
            product_id: tier.stripeProductId,
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
          const metadata = session.metadata;

          // Skip if no metadata (shouldn't happen)
          if (!metadata || !metadata.userId) {
            return { success: false, message: "Missing metadata in session" };
          }

          // Verify payment and add credits
          await this.verifyPayment(session.id);
          return { success: true, message: "Payment processed successfully" };
          break;
        }

        case "customer.subscription.created": {
          const subscription = event.data.object as Stripe.Subscription;

          // 1. Resolve our userId from the Stripe customer.
          const stripeCustomerId = subscription.customer as string;
          const stripeCustomerCollection = getCollection<any>(
            DATABASE,
            "stripe_customer"
          );
          const customerRecord = await stripeCustomerCollection.findOne({
            customer_id: stripeCustomerId,
          });
          const userId = customerRecord?.user_id;
          if (!userId) {
            return {
              success: false,
              message: "User not found for this customer",
            };
          }

          // 2. Resolve the tier from the price ID via the registry — the
          //    registry, not Stripe product metadata, is the source of truth
          //    for the credit budget.
          const item = subscription.items.data[0];
          const priceId = item.price.id;
          const resolved = resolveTierByPriceId(priceId);
          if (!resolved) {
            return {
              success: false,
              message: `No tier matches Stripe price ${priceId}`,
            };
          }
          const { tier, cadence } = resolved;

          // 3. Create the subscription with the tier's credit budget. A
          //    trialing subscription still gets the full budget so the trial
          //    actually unlocks the tier.
          await addNewSubscriptionWithCredit({
            userId,
            creditAmount: tier.creditBudget,
            startDateUnixTimestamp: item.current_period_start,
            endDateUnixTimestamp: item.current_period_end,
            tier: tier.id,
            subscriptionType: cadence,
            priceId,
            status: subscription.status,
            trialEndUnixTimestamp: subscription.trial_end ?? undefined,
            paymentMetaData: {
              provider: this.provider,
              stripe: {
                label: tier.userFacingName,
                subscription_id: subscription.id,
              },
            },
          });

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

            // A cancel that happened while still trialing is a trial cancel —
            // fire the server-truth analytics event.
            if (wasTrialing) {
              const userId = await this.getUserIdForCustomer(
                subscription.customer as string
              );
              if (userId) {
                trackServerEvent(
                  SERVER_ANALYTICS_EVENTS.TRIAL_CANCELED,
                  userId
                );
              }
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
          const previousAttributes = (event.data as any).previous_attributes;

          // Resolve the tier so a period rollover (renewal, or the trial->paid
          // transition) can refill the correct credit budget.
          const resolved = resolveTierByPriceId(priceId);

          const { success, message } =
            await updateSubscriptionStatusByProviderAndSubscriptionId({
              provider: this.provider,
              subscriptionId: subscription.id,
              status: subscription.status,
              startDateUnixTimestamp: item.current_period_start,
              endDateUnixTimestamp: item.current_period_end,
              tier: resolved?.tier.id,
              subscriptionType: resolved?.cadence,
              priceId,
              creditAmount: resolved?.tier.creditBudget,
              trialEndUnixTimestamp: subscription.trial_end ?? undefined,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });

          // trial -> paid conversion: fire the server-truth analytics event.
          if (
            previousAttributes?.status === "trialing" &&
            subscription.status === "active"
          ) {
            const userId = await this.getUserIdForCustomer(
              subscription.customer as string
            );
            if (userId) {
              trackServerEvent(
                SERVER_ANALYTICS_EVENTS.TRIAL_CONVERTED,
                userId,
                { cadence: resolved?.cadence, tier: resolved?.tier.id }
              );
            }
          }

          return {
            success,
            message,
          };
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

  public async getSubscriptionDetails(paymentId: string) {
    return this.stripe.subscriptions.retrieve(paymentId);
  }
}
