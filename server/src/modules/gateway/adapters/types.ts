import { Types } from "mongoose";
import { TierId, Cadence } from "../../subscription/tiers";

/**
 * Supported payment providers
 */
export enum PaymentProvider {
  STRIPE = "stripe",
  // Add other providers here in the future
}

/**
 * Common request interface for creating a checkout session.
 * The caller passes tier + cadence; the adapter resolves the single GBP Stripe
 * price ID live from product metadata (Stripe Adaptive Pricing localizes the
 * displayed currency), so the frontend never holds raw price IDs or a currency.
 */
export interface CreateCheckoutRequest {
  userId: string;
  tierId: TierId;
  cadence: Cadence;
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
