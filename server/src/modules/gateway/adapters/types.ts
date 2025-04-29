import { Types } from "mongoose";

/**
 * Supported payment providers
 */
export enum PaymentProvider {
  STRIPE = "stripe",
  // Add other providers here in the future
}

/**
 * Common request interface for creating a checkout session
 */
export interface CreateCheckoutRequest {
  userId: string;
  productId: string;
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Common response interface for checkout sessions
 */
export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
  expiresAt: Date;
  provider: PaymentProvider;
  metadata: Record<string, any>;
}

/**
 * Common response interface for payment verification
 */
export interface PaymentVerificationResult {
  success: boolean;
  paymentId?: string;
  status: "succeeded" | "pending" | "failed" | "canceled";
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Subscription details extracted from a payment
 */
export interface SubscriptionDetails {
  creditsAmount: number;
  subscriptionDays: number;
  [key: string]: any; // Allow additional provider-specific data
}

/**
 * Interface for payment provider adapters
 */
export interface PaymentAdapter {
  /**
   * Provider name
   */
  readonly provider: PaymentProvider;

  /**
   * Initialize the adapter
   */
  initialize(): Promise<void>;

  /**
   * Create a checkout session
   */
  createCheckoutSession(
    request: CreateCheckoutRequest
  ): Promise<CheckoutSessionResult>;

  /**
   * Verify payment status
   */
  verifyPayment(sessionId: string): Promise<PaymentVerificationResult>;

  /**
   * Handle webhook events from the provider
   */
  handleWebhook(eventData: any): Promise<{ success: boolean; message: string }>;

  /**
   * Extract subscription details from a payment
   * @param payment The payment object from the database
   * @returns Parsed subscription details
   */
  getSubscriptionDetails(payment: any): SubscriptionDetails;
}

/**
 * Configuration for payment adapters
 */
export interface PaymentAdapterConfig {
  [PaymentProvider.STRIPE]: {
    secretKey: string;
    webhookSecret?: string;
  };
  // Add configurations for other providers here
}
