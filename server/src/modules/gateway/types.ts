import { Types } from "mongoose";
import { PaymentProvider } from "./adapters/types";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "canceled";
export type SessionStatus = "created" | "completed" | "expired" | "failed";

export interface Payment {
  _id?: Types.ObjectId;
  user_id: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider_data: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaymentSession {
  _id?: Types.ObjectId;
  user_id: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  status: SessionStatus;
  provider_data: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CheckoutSessionRequest {
  productId: string;
  successUrl?: string;
  cancelUrl?: string;
  provider?: PaymentProvider; // Optional - defaults to STRIPE if not specified
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
  expiresAt: Date;
  provider: PaymentProvider;
}

export interface PaymentVerificationResponse {
  success: boolean;
  paymentId?: string;
  status: PaymentStatus;
  error?: string;
  provider?: PaymentProvider;
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
}
