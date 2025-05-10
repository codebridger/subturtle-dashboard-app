import { defineFunction } from "@modular-rest/server";
import {
  createCheckoutSession,
  verifyPaymentStatus,
  handleWebhookEvent,
} from "./service";
import { CheckoutSessionRequest } from "./types";
import { PaymentProvider } from "./adapters";

/**
 * Array of exported functions for the gateway module
 * These functions can be called from the client via functionProvider.run
 */

interface CreatePaymentParams {
  productId: string;
  provider?: PaymentProvider;
  successUrl?: string;
  cancelUrl?: string;
  userId?: string;
}

// Create a payment session for a product
const createPaymentSession = defineFunction({
  name: "createPaymentSession",
  permissionTypes: ["user_access"],
  callback: async function (params: CreatePaymentParams) {
    const {
      productId,
      provider = PaymentProvider.STRIPE,
      successUrl,
      cancelUrl,
      userId,
    } = params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    const request: CheckoutSessionRequest = {
      productId,
      provider,
      successUrl,
      cancelUrl,
    };

    return await createCheckoutSession(userId, request);
  },
});

// Verify a payment session
const verifyPayment = defineFunction({
  name: "verifyPayment",
  permissionTypes: ["user_access"],
  callback: async function (
    sessionId: string,
    provider: PaymentProvider = PaymentProvider.STRIPE
  ) {
    return await verifyPaymentStatus(sessionId, provider);
  },
});

export const functions = [createPaymentSession, verifyPayment];
