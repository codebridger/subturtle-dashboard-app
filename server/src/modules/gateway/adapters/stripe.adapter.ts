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
    // Try to find existing mapping
    let record = await stripeCustomerCollection.findOne({ user_id: userId });
    if (record && record.get("customer_id")) {
      return record.get("customer_id");
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
   * Create a checkout session for Stripe
   */
  async createCheckoutSession(
    request: CreateCheckoutRequest
  ): Promise<CheckoutSessionResult> {
    const { userId, productId, successUrl, cancelUrl } = request;

    // Ensure Stripe customer exists for this user
    const customerId = await this.getOrCreateStripeCustomer(userId);

    // Fetch product details from Stripe
    const product = await this.stripe.products.retrieve(productId);

    if (!product) {
      throw new Error(`Invalid product ID: ${productId}`);
    }

    // Get metadata from the product
    const creditsAmount = parseInt(product.metadata.creditsAmount || "0", 10);
    const subscriptionDays = parseInt(
      product.metadata.subscriptionDays || "0",
      10
    );

    if (!creditsAmount || !subscriptionDays) {
      throw new Error(
        "Product is missing required metadata: creditsAmount or subscriptionDays"
      );
    }

    // Get price data for this product
    const prices = await this.stripe.prices.list({
      product: productId,
      active: true,
      limit: 1,
    });

    if (!prices.data.length) {
      throw new Error("No active price found for this product");
    }

    const price = prices.data[0];

    // Create a Stripe checkout session
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: "subscription",
      customer: customerId,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        ...product.metadata,
        userId,
        productId,
        creditsAmount: creditsAmount.toString(),
        subscriptionDays: subscriptionDays.toString(),
      },
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
            price_id: price.id,
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

          // 1. Get the Stripe Customer ID from the subscription
          const stripeCustomerId = subscription.customer as string;

          // 2. Look up your userId from your database
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

          // 3. Get the invoice id from Stripe via the latest invoice
          let invoice_id: string | undefined = undefined;
          if (subscription.latest_invoice) {
            const invoice = await this.stripe.invoices.retrieve(
              subscription.latest_invoice as string
            );
            invoice_id = (invoice.id as string) || undefined;
          }

          // 4. Get product metadata
          const subscriptionItem = subscription.items.data[0];
          const priceId = subscriptionItem.price.id;
          const price = await this.stripe.prices.retrieve(priceId);
          const productId = price.product as string;
          const product = await this.stripe.products.retrieve(productId);
          const creditsAmount = product.metadata.creditsAmount;

          // 5. Get the current period start and end
          const currentPeriodStart =
            subscription.items.data[0].current_period_start;
          const currentPeriodEnd =
            subscription.items.data[0].current_period_end;

          // 6. Add credits to user's subscription
          await addNewSubscriptionWithCredit({
            userId,
            creditAmount: parseInt(creditsAmount, 10),
            startDateUnixTimestamp: currentPeriodStart,
            endDateUnixTimestamp: currentPeriodEnd,
            paymentMetaData: {
              provider: this.provider,
              stripe: {
                label: product.name,
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
            const { success, message } =
              await cancelSubscriptionByProviderAndSubscriptionId({
                provider: this.provider,
                subscriptionId: subscription.id,
                status: subscription.status,
              });

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

          const currentPeriodStart =
            subscription.items.data[0].current_period_start;
          const currentPeriodEnd =
            subscription.items.data[0].current_period_end;

          const { success, message } =
            await updateSubscriptionStatusByProviderAndSubscriptionId({
              provider: this.provider,
              subscriptionId: subscription.id,
              status: subscription.status,
              startDateUnixTimestamp: currentPeriodStart,
              endDateUnixTimestamp: currentPeriodEnd,
            });

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
