This document outlines the design of Subturtle's internal credit-based subscription module. The module serves as a critical component that tracks and manages credit consumption across various services while maintaining a seamless user experience. By operating behind the scenes, it enables controlled resource allocation without exposing limitations directly to users. This system balances business sustainability with quality of service, providing flexible interfaces for other modules to interact with credit management while maintaining clear boundaries of responsibility.

## System Architecture Overview

The subscription system will function as an internal module within the Subturtle backend application, silently managing credit allocations and usage tracking without exposing limitations to end users. The module provides a clean API for other system components to check balances, record usage, and manage credit allocation.

## Core Mechanisms and Module Interface

### Module Methods

The subscription module will expose the following methods to other parts of the system:

1. **checkDailyAllocation(userId)**
    *   Purpose: Determine if a user has sufficient balance for requested operations
    *   Returns: Available balance in Credits (currency-neutral unit) and allowed service levels
    *   Usage: Called before initiating credit-consuming operations
    *   Internal process: Calculates today's allocation based on subscription type, unused rollover balance, and consumption history
    *   Note: This method creates the Daily Credits record if none exists for the current day
2. **addCredit(userId, creditAmount, paymentDetails)**
    *   Purpose: Add Credits (currency-neutral units) to a user's account upon successful payment
    *   Called by: Payment gateway after successful transaction
    *   Process: Adds the specified Credit amount, updates subscription status, and triggers welcome events
    *   Returns: Updated subscription details including expiration date and Credit balance
3. **recordTransaction(type, details)**
    *   Specialized transaction recording methods:
        *   **recordConversationUsage(userId, durationSeconds, modelType, complexity)**
        *   **recordTranslationUsage(userId, characterCount, languagePair, contextType)**
    *   Purpose: Track service usage and deduct appropriate Credits
    *   Process: Converts usage metrics to Credit costs, deducts from user's balance, stores token data for history only
    *   Returns: Remaining Credit balance and updated usage statistics
4. **subscriptionEvents**
    *   Event emitters for other modules to subscribe to:
        *   `onLowCredits`: Triggered when user falls below threshold (internal only)
        *   `onSubscriptionChange`: Triggered when subscription status changes
        *   `onUsageSpike`: Triggered when unusual consumption patterns detected
    *   Purpose: Allow other modules to react to subscription-related events without tight coupling

### Core Components

1. **Credit Calculator**: Converts AI operations to credit costs
2. **Daily Allocator**: Manages daily credit allowances
3. **Usage Monitor**: Tracks credit consumption across services

## Core Mechanism Details

### Credit Allocation and Tracking

1. **Subscription to Credit Conversion**
    *   When a user purchases a subscription, the total price is divided into:
        *   System-benefit (platform costs)
        *   Service-cost (operational expenses)
        *   Spendable (available for AI service consumption)
    *   Only the Spendable portion is converted to Credits (currency-neutral units) and allocated to the user
2. **Daily Credit Distribution**
    *   The total spendable Credits are divided by the subscription period (30/90/365 days)
    *   Daily allocations are calculated on-demand during checkDailyAllocation calls, not via scheduled tasks
    *   If no Daily Credits record exists for the current day, it's created at check time
    *   Unused Credits automatically roll over to subsequent days
    *   The system maintains a running tally of accumulated Credits
3. **Usage and Cost Tracking**
    *   Each AI service operation consumes Credits based on predefined conversion rates
    *   The system records token usage data only for historical and analytical purposes
    *   Credit consumption is tracked in real-time but processed in small batches for efficiency
    *   Credits serve as the primary balance unit that can be synchronized with any currency as needed
4. **Balance Management**
    *   The system maintains two key balances:
        *   Total subscription Credits remaining
        *   Today's available Credits (daily allocation + rollover)

## Database Schema

#### Subscriptions Table

```plain
subscription_id: UUID (PK)
user_id: UUID (FK)
subscription_type: ENUM (monthly, quarterly, annual)
start_date: TIMESTAMP
end_date: TIMESTAMP
total_credits: DECIMAL
system_benefit_portion: DECIMAL
service_cost_portion: DECIMAL
spendable_credits: DECIMAL
status: ENUM (active, expired, canceled)
```

#### Daily Credits Table

```plain
allocation_id: UUID (PK)
subscription_id: UUID (FK)
date: DATE
daily_credit_limit: DECIMAL
credits_used: DECIMAL
credits_rolled_over: DECIMAL
```

#### Usage Table

```plain
usage_id: UUID (PK)
user_id: UUID (FK)
subscription_id: UUID (FK)
service_type: VARCHAR
credit_amount: DECIMAL
token_count: INTEGER  # For historical/analytics purposes only
model_used: VARCHAR
timestamp: TIMESTAMP
session_id: UUID
details: JSONB
```

## Implementation Considerations

### Technical Aspects

*   Use atomic transactions for credit deductions
*   Implement caching for frequently accessed credit balances
*   Consider batch processing for credit calculations
*   Ensure proper error handling for interrupted AI services

### Architecture Notes

*   Keep credit system decoupled from other services for modularity
*   Use event-driven architecture for usage reporting
*   Implement retries with exponential backoff for failed credit calculations