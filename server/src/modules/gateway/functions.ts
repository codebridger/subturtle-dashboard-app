import { defineFunction } from "@modular-rest/server";
import { createCheckoutSession, verifyPaymentStatus } from "./service";
import { CheckoutSessionRequest } from "./types";

/**
 * Array of exported functions for the gateway module
 * These functions can be called from the client via $api.gateway.functionName
 */

interface CreatePaymentParams {
  productId: string;
  successUrl?: string;
  cancelUrl?: string;
  userId?: string;
}

// Create a payment session for a product
const createPaymentSession = defineFunction({
  name: "createPaymentSession",
  permissionTypes: ["user_access"],
  callback: async function (params: CreatePaymentParams) {
    const { productId, successUrl, cancelUrl, userId } = params;

    // With user_access permission, userId should be available in the context
    // Request object is automatically passed by modular-rest

    if (!userId) {
      throw new Error("User not authenticated");
    }

    const request: CheckoutSessionRequest = {
      productId,
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
  callback: async function (sessionId: string) {
    return await verifyPaymentStatus(sessionId);
  },
});

export const functions = [createPaymentSession, verifyPayment];
