import { Types } from "mongoose";
import { PaymentProvider } from "../gateway/adapters";
import { TierId } from "./tiers";
import { Entitlements } from "./entitlements";

/** A one-shot voice-minute top-up pack purchased on top of the active subscription
 *  (Council 004 overage). Stored as a ledger entry on the subscription document. */
export interface VoiceTopUp {
  session_id: string; // Stripe checkout session id — idempotency key
  pack_size: number; // nominal pack size in minutes (30 | 120)
  // Minutes this pack contributes: == pack_size at purchase, reduced to the surviving
  // REMAINING when folded forward across a subscription renewal.
  minutes: number;
  purchased_at: Date;
  expires_at: Date; // 90 days from purchase
}

/** Derived per-pack view returned to the client (expired packs excluded). */
export interface ActiveTopUp {
  pack_size: number;
  minutes_remaining: number;
  expires_at: Date | string;
}

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
  voice_minutes_total?: number;
  voice_minutes_used?: number;
  // Reader text-chat caps (Council 004 follow-up): monthly chat count + counter.
  allowed_text_chats?: number;
  allowed_text_chats_used?: number;
  // Voice-minute top-up ledger (Council 004 overage). Survives renewal until each
  // pack's 90-day expiry; the per-pack remaining + active list are derived.
  top_ups?: VoiceTopUp[];
  // Derived (not stored): non-expired packs with per-pack remaining, attached by
  // getSubscription for the client.
  active_top_ups?: ActiveTopUp[];
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
  // Period marker for idempotent grants + the entitlement snapshot locked for
  // the current paid period (ADR-004). See db.ts for the rules.
  granted_period_end?: Date;
  entitlements?: Entitlements;
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
  allowed_text_chats?: number;
  allowed_text_chats_used?: number;
  voice_minutes_total?: number;
  voice_minutes_used?: number;
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
