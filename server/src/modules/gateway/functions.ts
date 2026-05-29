import { defineFunction } from "@modular-rest/server";
import {
  createCheckoutSession,
  verifyPaymentStatus,
  handleWebhookEvent,
} from "./service";
import { CheckoutSessionRequest } from "./types";
import { PaymentProvider, PaymentAdapterFactory } from "./adapters";
import { TierId, Cadence } from "../subscription/tiers";

/**
 * Array of exported functions for the gateway module
 * These functions can be called from the client via functionProvider.run
 */

interface CreatePaymentParams {
  tierId: TierId;
  cadence: Cadence;
  provider?: PaymentProvider;
  successUrl?: string;
  cancelUrl?: string;
  userId?: string;
}

// Create a payment session for a tier
const createPaymentSession = defineFunction({
  name: "createPaymentSession",
  permissionTypes: ["user_access"],
  callback: async function (params: CreatePaymentParams) {
    const {
      tierId,
      cadence,
      provider = PaymentProvider.STRIPE,
      successUrl,
      cancelUrl,
      userId,
    } = params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    const request: CheckoutSessionRequest = {
      tierId,
      cadence,
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

// Create an embedded Custom Checkout session — returns a client secret for the
// Stripe Checkout Elements SDK so the localized price + payment render in-app
// (no redirect), with Adaptive Pricing localizing the displayed currency.
const createCustomCheckoutSession = defineFunction({
  name: "createCustomCheckoutSession",
  permissionTypes: ["user_access"],
  callback: async function (params: {
    tierId: TierId;
    cadence: Cadence;
    successUrl?: string;
    userId?: string;
  }) {
    const { tierId, cadence, successUrl, userId } = params;
    if (!userId) {
      throw new Error("User ID is required");
    }
    return await PaymentAdapterFactory.getStripeAdapter().createCustomCheckoutSession(
      { userId, tierId, cadence, successUrl }
    );
  },
});

export const functions = [
  createPaymentSession,
  verifyPayment,
  createCustomCheckoutSession,
];
