import { EventEmitter } from "events";
import { Types } from "mongoose";

// Create a subscription event emitter for other modules to subscribe to
export const subscriptionEvents = new EventEmitter();

// Define event types
export const EVENT_TYPES = {
  LOW_CREDITS: "low_credits",
  SUBSCRIPTION_CHANGE: "subscription_change",
  USAGE_SPIKE: "usage_spike",
  SUBSCRIPTION_EXPIRED: "subscription_expired",
  SUBSCRIPTION_RENEWED: "subscription_renewed",
};

/**
 * Emit low credits event
 * @param userId - The user ID
 * @param remainingCredits - The remaining credits
 */
export function emitLowCreditsEvent(
  userId: string,
  remainingCredits: number
): void {
  subscriptionEvents.emit(EVENT_TYPES.LOW_CREDITS, {
    userId,
    remainingCredits,
    timestamp: new Date(),
  });
}

/**
 * Emit subscription change event
 * @param userId - The user ID
 * @param subscriptionId - The subscription ID
 * @param changeType - The type of change (new, updated, canceled)
 * @param details - Additional details about the change
 */
export function emitSubscriptionChangeEvent(
  userId: string,
  subscriptionId: Types.ObjectId,
  changeType: "new" | "updated" | "canceled",
  details?: Record<string, any>
): void {
  subscriptionEvents.emit(EVENT_TYPES.SUBSCRIPTION_CHANGE, {
    userId,
    subscriptionId,
    changeType,
    details,
    timestamp: new Date(),
  });
}

/**
 * Emit usage spike event
 * @param userId - The user ID
 * @param serviceType - The type of service
 * @param usageAmount - The amount of usage
 * @param threshold - The threshold that was exceeded
 */
export function emitUsageSpikeEvent(
  userId: string,
  serviceType: string,
  usageAmount: number,
  threshold: number
): void {
  subscriptionEvents.emit(EVENT_TYPES.USAGE_SPIKE, {
    userId,
    serviceType,
    usageAmount,
    threshold,
    timestamp: new Date(),
  });
}

/**
 * Emit subscription expired event
 * @param userId - The user ID
 * @param subscriptionId - The subscription ID
 */
export function emitSubscriptionExpiredEvent(
  userId: string,
  subscriptionId: Types.ObjectId
): void {
  subscriptionEvents.emit(EVENT_TYPES.SUBSCRIPTION_EXPIRED, {
    userId,
    subscriptionId,
    timestamp: new Date(),
  });
}

/**
 * Emit subscription renewed event
 * @param userId - The user ID
 * @param subscriptionId - The subscription ID
 * @param newEndDate - The new end date
 */
export function emitSubscriptionRenewedEvent(
  userId: string,
  subscriptionId: Types.ObjectId,
  newEndDate: Date
): void {
  subscriptionEvents.emit(EVENT_TYPES.SUBSCRIPTION_RENEWED, {
    userId,
    subscriptionId,
    newEndDate,
    timestamp: new Date(),
  });
}

// Setup event listeners that might be used internally
subscriptionEvents.on(EVENT_TYPES.LOW_CREDITS, (data) => {
  // Log low credits event
  console.log(
    `[Subscription] Low credits alert for user ${data.userId}: ${data.remainingCredits} credits remaining`
  );

  // Here you could trigger notifications or other actions
  // This is just a placeholder for demonstration
});

subscriptionEvents.on(EVENT_TYPES.SUBSCRIPTION_EXPIRED, (data) => {
  // Log subscription expired event
  console.log(
    `[Subscription] Subscription ${data.subscriptionId} expired for user ${data.userId}`
  );

  // Here you could trigger notifications or other actions
  // This is just a placeholder for demonstration
});

// Export the emitter to be used by other modules
export default subscriptionEvents;
