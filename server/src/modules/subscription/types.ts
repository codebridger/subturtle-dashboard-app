import { Types } from "mongoose";
import { PaymentProvider } from "../gateway/adapters";
import { TierId } from "./tiers";

export interface Subscription {
  _id?: Types.ObjectId;
  user_id: Types.ObjectId;
  subscription_type?: "monthly" | "annual";
  tier?: TierId;
  price_id?: string;
  trial_end?: Date;
  cancel_at_period_end?: boolean;
  start_date: Date;
  end_date: Date;
  total_credits: number;
  credits_used: number;
  status:
    | "active"
    | "canceled"
    | "expired"
    | "incomplete"
    | "incomplete_expired"
    | "past_due"
    | "paused"
    | "trialing"
    | "unpaid";
  available_credit?: number;
  remaining_days?: number;
  usage_percentage?: number;
  total_credit_in_usd?: number;
  used_credit_in_usd?: number;
  available_credit_in_usd?: number;
  payments?: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
  payment_meta_data?: {
    provider: PaymentProvider;
    [key: string]: any;
  };
}

export interface FreeCredit {
  _id?: Types.ObjectId;
  user_id: Types.ObjectId;
  start_date: Date;
  end_date: Date;
  total_credits: number;
  credits_used: number;
  allowed_save_words: number;
  allowed_save_words_used: number;
  allowed_lived_sessions: number;
  allowed_lived_sessions_used: number;
  ai_exhausted_flagged?: boolean;
  available_credit?: number;
  usage_percentage?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Usage {
  _id?: Types.ObjectId;
  user_id: Types.ObjectId;
  subscription_id: Types.ObjectId;
  service_type: string;
  credit_used: number;
  token_count: number;
  model_used: string;
  timestamp: Date;
  session_id?: Types.ObjectId;
  details?: Record<string, any>;
}

export interface PaymentDetails {
  subscriptionType: "monthly" | "annual";
  paymentMethod?: string;
  transactionId?: string;
  currency?: string;
  amount?: number;
}

export interface CreditStatusResponse {
  availableCredits: number;
  allowedServices: string[];
  hasActiveSubscription: boolean;
  subscriptionType?: string;
  subscriptionEndsAt?: Date;
}

export interface CreditAdditionResponse {
  subscriptionId: Types.ObjectId;
  subscriptionType: string;
  expirationDate: Date;
  creditBalance: number;
}

export interface UsageRecordResponse {
  remainingCredits: number;
  usageId: Types.ObjectId;
  totalUsage: number;
}
