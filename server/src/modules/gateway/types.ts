import { Types } from "mongoose";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "canceled";
export type SessionStatus = "created" | "completed" | "expired" | "failed";

export interface Payment {
  _id?: Types.ObjectId;
  user_id: Types.ObjectId;
  stripe_customer_id?: string;
  amount: number;
  currency: string;
  product_id: string;
  status: PaymentStatus;
  stripe_payment_id?: string;
  payment_method?: string;
  credits_added?: number;
  subscription_days: number;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaymentSession {
  _id?: Types.ObjectId;
  user_id: Types.ObjectId;
  stripe_session_id: string;
  product_id: string;
  amount: number;
  currency: string;
  status: SessionStatus;
  expires_at: Date;
  success_url: string;
  cancel_url: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CheckoutSessionRequest {
  productId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
  expiresAt: Date;
}

export interface PaymentVerificationResponse {
  success: boolean;
  paymentId?: string;
  status: PaymentStatus;
  error?: string;
}

// Plan configuration
export interface PlanConfig {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  creditsAmount: number;
  subscriptionDays: number;
  stripePriceId?: string; // When using Stripe Products & Prices
}
