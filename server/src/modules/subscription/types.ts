import { Types } from "mongoose";

export interface Subscription {
  _id?: Types.ObjectId;
  user_id: Types.ObjectId;
  subscription_type: "monthly" | "quarterly" | "annual";
  start_date: Date;
  end_date: Date;
  total_credits: number;
  system_benefit_portion: number;
  service_cost_portion: number;
  spendable_credits: number;
  status: "active" | "expired" | "canceled";
}

export interface DailyCredits {
  _id?: Types.ObjectId;
  subscription_id: Types.ObjectId;
  date: Date;
  daily_credit_limit: number;
  credits_used: number;
  credits_rolled_over: number;
}

export interface Usage {
  _id?: Types.ObjectId;
  user_id: Types.ObjectId;
  subscription_id: Types.ObjectId;
  service_type: string;
  credit_amount: number;
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
  totalUsageToday: number;
  totalUsageMonth: number;
}
