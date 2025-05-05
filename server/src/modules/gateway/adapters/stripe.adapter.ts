import { getCollection } from "@modular-rest/server";
import Stripe from "stripe";
import {
  DATABASE,
  PAYMENT_COLLECTION,
  PAYMENT_SESSION_COLLECTION,
} from "../../../config";
import { addNewSubscriptionWithCredit } from "../../subscription/service";
import {
  CreateCheckoutRequest,
  CheckoutSessionResult,
  PaymentAdapter,
  PaymentProvider,
  PaymentVerificationResult,
  SubscriptionDetails,
} from "./types";
import { Payment, PaymentSession } from "../types";

/**
 * Stripe payment adapter implementation
 */
export class StripeAdapter implements PaymentAdapter {
  readonly provider = PaymentProvider.STRIPE;
  private stripe: Stripe;

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
   * Extract subscription details from a payment
   * @param payment The payment object from the database
   * @returns Parsed subscription details
   */
  getSubscriptionDetails(payment: Payment): SubscriptionDetails {
    // Get metadata from either the payment metadata or provider_data.metadata
    // Since the metadata could be in different places depending on how it was saved
    const metadata = payment.provider_data?.metadata;

    // Parse the subscription details with defaults
    const creditsAmount = parseInt(metadata.creditsAmount || "0", 10);
    const subscriptionDays = parseInt(metadata.subscriptionDays || "0", 10);

    // Return structured subscription details
    return {
      creditsAmount,
      subscriptionDays,
      rawMetadata: metadata, // Include the raw metadata for reference
      productId: metadata.productId || payment.provider_data?.product_id,
      userId: payment.user_id,
    };
  }

  /**
   * Create a checkout session for Stripe
   */
  async createCheckoutSession(
    request: CreateCheckoutRequest
  ): Promise<CheckoutSessionResult> {
    const { userId, productId, successUrl, cancelUrl } = request;

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

    // Default URLs if not provided
    const defaultSuccessUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/payment-success`;
    const defaultCancelUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/payment-canceled`;

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
      success_url: `${
        successUrl || defaultSuccessUrl
      }?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || defaultCancelUrl,
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
            success_url: successUrl || defaultSuccessUrl,
            cancel_url: cancelUrl || defaultCancelUrl,
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

      // Get metadata from the checkout session
      const creditsAmount = parseInt(
        checkoutSession.metadata?.creditsAmount || "0",
        10
      );
      const subscriptionDays = parseInt(
        checkoutSession.metadata?.subscriptionDays || "0",
        10
      );

      // Create payment record
      const paymentCollection = getCollection(DATABASE, PAYMENT_COLLECTION);

      // Create a payment record
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
              payment_id: checkoutSession.payment_intent as string,
              customer_id: checkoutSession.customer,
              product_id: session.provider_data.product_id,
              metadata: checkoutSession.metadata || {},
            },
          },
        },
        { upsert: true }
      );

      // Get the payment document
      const payment = await paymentCollection.findOne({
        "provider_data.session_id": sessionId,
      });

      // Add credits to user's subscription
      await addNewSubscriptionWithCredit({
        userId: session.user_id,
        creditAmount: creditsAmount,
        totalDays: subscriptionDays,
        payment_id: payment?._id,
      });

      return {
        success: true,
        paymentId: payment?._id.toString(),
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
        }

        // Handle other webhook events here

        default:
          return {
            success: true,
            message: `Unhandled event type: ${event.type}`,
          };
      }
    } catch (error: any) {
      console.error("Webhook error:", error);
      return {
        success: false,
        message: error.message || "Unknown error occurred",
      };
    }
  }
}
