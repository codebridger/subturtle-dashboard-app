import { defineFunction } from "@modular-rest/server";
import {
  createCheckoutSession,
  verifyPaymentStatus,
  handleWebhookEvent,
} from "./service";
import { CheckoutSessionRequest } from "./types";
import { PaymentProvider, PaymentAdapterFactory } from "./adapters";
import { TierId, Cadence } from "../subscription/tiers";
import { assertNoActiveSubscription } from "../subscription/service";

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

    // No stacking: a user with an active paid plan changes it via the billing
    // portal, never a second checkout (which would create a parallel sub).
    await assertNoActiveSubscription(userId);

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

    // No stacking: a user with an active paid plan changes it via the billing
    // portal, never a second checkout (which would create a parallel sub).
    await assertNoActiveSubscription(userId);

    return await PaymentAdapterFactory.getStripeAdapter().createCustomCheckoutSession(
      { userId, tierId, cadence, successUrl }
    );
  },
});

// Create a HOSTED one-shot checkout for a voice-minute top-up pack (Council 004).
// Returns the Stripe-hosted URL the client opens in a new tab; the top-up webhook
// grants the minutes on completion.
const createVoiceTopUpCheckout = defineFunction({
  name: "create-voice-topup-checkout",
  permissionTypes: ["user_access"],
  callback: async function (params: {
    packKey?: string;
    successUrl?: string;
    cancelUrl?: string;
    userId?: string;
  }) {
    const { packKey, successUrl, cancelUrl, userId } = params;
    if (!userId) {
      throw new Error("User ID is required");
    }
    if (packKey !== "topup_30" && packKey !== "topup_120") {
      throw new Error('Unknown top-up pack (expected "topup_30" or "topup_120")');
    }
    return await PaymentAdapterFactory.getStripeAdapter().createVoiceTopUpCheckoutSession(
      { userId, packKey, successUrl, cancelUrl }
    );
  },
});

export const functions = [
  createPaymentSession,
  verifyPayment,
  createCustomCheckoutSession,
  createVoiceTopUpCheckout,
];
