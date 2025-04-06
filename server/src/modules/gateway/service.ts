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
import { PaymentProvider, paymentAdapterFactory } from "./adapters";

// Initialize Stripe with a simpler approach
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// Initialize the payment adapters
async function initializePaymentAdapters() {
  await paymentAdapterFactory.initialize();
}

// Initialize on module load
initializePaymentAdapters().catch((err) => {
  console.error("Failed to initialize payment adapters:", err);
});

/**
 * Create a checkout session
 */
export async function createCheckoutSession(
  userId: string,
  request: CheckoutSessionRequest
): Promise<CheckoutSessionResponse> {
  const { provider = PaymentProvider.STRIPE } = request;
  const adapter = paymentAdapterFactory.getAdapter(provider);

  try {
    const result = await adapter.createCheckoutSession({
      userId,
      productId: request.productId,
      successUrl: request.successUrl,
      cancelUrl: request.cancelUrl,
    });

    return {
      sessionId: result.sessionId,
      url: result.url,
      expiresAt: result.expiresAt,
      provider: result.provider,
    };
  } catch (error: any) {
    console.error(`Payment creation error (${provider}):`, error);
    throw new Error(
      error.message || `Failed to create ${provider} checkout session`
    );
  }
}

/**
 * Verify payment status
 */
export async function verifyPaymentStatus(
  sessionId: string,
  provider: PaymentProvider = PaymentProvider.STRIPE
): Promise<PaymentVerificationResponse> {
  const adapter = paymentAdapterFactory.getAdapter(provider);

  try {
    const result = await adapter.verifyPayment(sessionId);

    return {
      success: result.success,
      paymentId: result.paymentId,
      status: result.status,
      error: result.error,
      provider: result.metadata?.provider || provider,
    };
  } catch (error: any) {
    console.error(`Payment verification error (${provider}):`, error);
    throw new Error(error.message || `Failed to verify ${provider} payment`);
  }
}

/**
 * Handle webhook events
 */
export async function handleWebhookEvent(
  eventData: any,
  provider: PaymentProvider = PaymentProvider.STRIPE
): Promise<{ success: boolean; message: string }> {
  const adapter = paymentAdapterFactory.getAdapter(provider);

  try {
    return await adapter.handleWebhook(eventData);
  } catch (error: any) {
    console.error(`Webhook handling error (${provider}):`, error);
    return {
      success: false,
      message: error.message || `Failed to handle ${provider} webhook`,
    };
  }
}
