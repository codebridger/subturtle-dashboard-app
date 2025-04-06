import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import Stripe from "stripe";
import {
  DATABASE,
  PAYMENT_COLLECTION,
  PAYMENT_SESSION_COLLECTION,
} from "../../config";
import {
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  PaymentVerificationResponse,
} from "./types";
import { addCredit } from "../subscription/service";

// Initialize Stripe with a simpler approach
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

/**
 * Create a checkout session for the Stripe product
 */
export async function createCheckoutSession(
  userId: string,
  request: CheckoutSessionRequest
): Promise<CheckoutSessionResponse> {
  const { productId, successUrl, cancelUrl } = request;

  // Fetch product details from Stripe
  const product = await stripe.products.retrieve(productId);

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
  const prices = await stripe.prices.list({
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
  const session = await stripe.checkout.sessions.create({
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

  // Use direct update with the user ID as string
  // The collection will handle the proper ObjectId conversion
  await paymentSessionCollection.updateOne(
    { stripe_session_id: session.id },
    {
      $set: {
        user_id: userId, // MongoDB will convert string to ObjectId
        stripe_session_id: session.id,
        product_id: productId,
        amount: price.unit_amount ? price.unit_amount / 100 : 0,
        currency: price.currency,
        status: "created",
        expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
        success_url: successUrl || defaultSuccessUrl,
        cancel_url: cancelUrl || defaultCancelUrl,
      },
    },
    { upsert: true }
  );

  return {
    sessionId: session.id,
    url: session.url || "",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  };
}

/**
 * Verify payment status and update user's subscription
 */
export async function verifyPaymentStatus(
  sessionId: string
): Promise<PaymentVerificationResponse> {
  try {
    // Check if payment session exists in our database
    const paymentSessionCollection = getCollection(
      DATABASE,
      PAYMENT_SESSION_COLLECTION
    );
    const sessionDoc = await paymentSessionCollection.findOne({
      stripe_session_id: sessionId,
    });

    if (!sessionDoc) {
      throw new Error("Payment session not found");
    }

    // Type assertion to handle MongoDB document typing
    const session = sessionDoc as any;

    // Check payment status with Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    // If already processed, return success
    if (session.status === "completed") {
      const paymentCollection = getCollection(DATABASE, PAYMENT_COLLECTION);
      // Type assertion for payment document
      const payment = (await paymentCollection.findOne({
        stripe_session_id: sessionId,
      })) as any;

      return {
        success: true,
        paymentId: payment?._id.toString(),
        status: "succeeded",
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
    await paymentCollection.create({
      user_id: session.user_id,
      amount: session.amount,
      currency: session.currency,
      product_id: session.product_id,
      status: "succeeded",
      stripe_payment_id: checkoutSession.payment_intent as string,
      payment_method: "card",
      credits_added: creditsAmount,
      subscription_days: subscriptionDays,
      metadata: {
        stripe_session_id: sessionId,
        customer_email: checkoutSession.customer_details?.email,
      },
    });

    // Get the payment document
    const payment = (await paymentCollection.findOne({
      metadata: { stripe_session_id: sessionId },
    })) as any;

    // Add credits to user's subscription
    await addCredit(
      session.user_id.toString(),
      creditsAmount,
      subscriptionDays,
      {
        paymentMethod: "stripe",
        transactionId: checkoutSession.payment_intent,
        amount: session.amount,
        currency: session.currency,
      }
    );

    return {
      success: true,
      paymentId: payment?._id.toString(),
      status: "succeeded",
    };
  } catch (error: any) {
    console.error("Payment verification error:", error);
    throw new Error(error.message || "Unknown error occurred");
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(
  event: Stripe.Event
): Promise<{ success: boolean; message: string }> {
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata;

        // Skip if no metadata (shouldn't happen)
        if (!metadata || !metadata.userId) {
          return { success: false, message: "Missing metadata in session" };
        }

        // Verify payment and add credits
        await verifyPaymentStatus(session.id);
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
