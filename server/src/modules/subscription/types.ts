import { Types } from "mongoose";
import { PaymentProvider } from "../gateway/adapters";

export interface SubscriptionPlan {
  name: string;
  product_id: string;
  price: string;
  currency: string;
  description?: string;
  features: string[];
  is_freemium: boolean;
}

export interface Subscription {
  _id?: Types.ObjectId;
  user_id: Types.ObjectId;
  subscription_type: "monthly" | "quarterly" | "annual";
  start_date: Date;
  end_date: Date;
  total_credits: number;
  credits_used: number;
  status:
    | "active"
    | "canceled"
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
  available_credit?: number;
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
  subscriptionType: "monthly" | "quarterly" | "annual";
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
