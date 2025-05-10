This document outlines the design of Subturtle's internal credit-based subscription module. The module serves as a critical component that tracks and manages credit consumption across various services while maintaining a seamless user experience. By operating behind the scenes, it enables controlled resource allocation without exposing limitations directly to users. This system balances business sustainability with quality of service, providing flexible interfaces for other modules to interact with credit management while maintaining clear boundaries of responsibility.

## System Architecture Overview

The subscription system functions as an internal module within the Subturtle backend application, silently managing credit allocations and usage tracking without exposing limitations to end users. The module provides a clean API for other system components to check balances, record usage, and manage credit allocation.

## Core Mechanisms and Module Interface

### Module Methods

The subscription module exposes the following methods to other parts of the system:

1. **checkCreditAllocation(userId, minCredits?)**
    *   Purpose: Determine if a user has sufficient balance for requested operations
    *   Returns: Available credits, subscription end date, and allowed-to-proceed flag
    *   Usage: Called before initiating credit-consuming operations
    *   Internal process: Checks the current active subscription for available credits
    *   Triggers: Emits low-credits event if credits are below the threshold
2. **addNewSubscriptionWithCredit(userId, creditAmount, totalDays, paymentDetails)**
    *   Purpose: Add Credits to a user's account upon successful payment
    *   Called by: Payment gateway after successful transaction
    *   Process: Adds the specified Credit amount, creates subscription, and triggers events
    *   Returns: Updated subscription details including expiration date and Credit balance
3. **recordUsage(userId, serviceType, costInputs, modelUsed?, details?)**
    *   Purpose: Track service usage and deduct appropriate Credits
    *   Process: Uses calculator service to convert usage metrics to Credit costs
    *   Input: Takes an array of CostCalculationInput objects for precise cost calculation
    *   Returns: Remaining Credit balance, usage ID, status, and detailed cost breakdown
4. **subscriptionEvents**
    *   Event emitters for other modules to subscribe to:
        *   `low_credits`: Triggered when user falls below threshold (internal only)
        *   `subscription_change`: Triggered when subscription status changes
        *   `subscription_expired`: Triggered when subscription expires
        *   `subscription_renewed`: Triggered when subscription is renewed
    *   Purpose: Allow other modules to react to subscription-related events without tight coupling

### API Functions

The module exposes these API functions for external access:

1. **getSubscriptionDetails**
    *   Purpose: Retrieve comprehensive information about a user's active subscription
    *   Returns: Complete subscription object with credit information
    *   Access: Requires user authentication

### Core Components

1. **Calculator Service**: Converts AI operations to credit costs with high precision
    *   Uses decimal.js-light for accurate financial calculations
    *   Provides utilities for USD <-> Credit conversions
    *   Handles detailed cost breakdowns for multiple token types
2. **Subscription Service**: Manages subscription lifecycle and credit allocations
3. **Events System**: Provides event-driven communication for subscription state changes

## Core Mechanism Details

### Credit Allocation and Calculation

1. **High-Precision Calculation**
    *   Uses `COST_TRANSPOSE` factor (100 million) for representing currency with integer precision
    *   Implements formula: `(costPerMillion × transpose × totalTokens) ÷ tokenUnit`
    *   Handles multiple expense items per operation with detailed breakdowns
2. **Token Cost Tracking**
    *   Each AI service operation is calculated based on token usage and pricing per million tokens
    *   The system maintains independent cost tracking for different token types (e.g., input vs. output)
    *   Costs are stored in both USD and transposed credit values for flexibility
3. **Balance Management**
    *   The system maintains total subscription credits and available credits
    *   Credit thresholds trigger warnings when balances fall below configured levels

## Database Schema

#### Subscriptions Table

```plain
_id: ObjectId (PK)
user_id: ObjectId (FK)
subscription_type: ENUM (monthly, quarterly, annual)
start_date: Date
end_date: Date
total_credits: Number
credits_used: Number
status: ENUM (active, expired, canceled)
available_credit: Number (virtual/calculated)
```

#### Usage Table

```plain
_id: ObjectId (PK)
user_id: ObjectId (FK)
subscription_id: ObjectId (FK)
service_type: String
credit_used: Number
token_count: Number
model_used: String
timestamp: Date
status: ENUM (paid, unpaid, overdraft)
details: Object
  - costBreakdown: Array (detailed cost breakdown per token type)
```

## Implementation Considerations

### Technical Aspects

*   Uses decimal.js-light for high-precision financial calculations
*   Centralized configuration in `config.ts` for easy maintenance
*   Implements event-driven architecture for subscription state changes
*   Provides detailed cost breakdowns for analytics and transparency

### Architecture Highlights

*   Calculator service acts as a standalone component for reuse across the system
*   Modular design with clear separation of concerns
*   Event system enables loose coupling between subscription management and consumers
*   Configuration-driven thresholds and conversion factors