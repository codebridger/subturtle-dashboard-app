# Subscription Module Architecture

## Module Structure Diagram

```mermaid
graph TD
    %% Main files
    Service[service.ts]
    DB[db.ts]
    Events[events.ts]
    Types[types.ts]
    Functions[functions.ts]
    Calculator[calculator.ts]
    Config[config.ts]
    
    %% Interfaces and Types
    subgraph Types[types.ts]
        SubscriptionInterface[Subscription Interface]
        UsageInterface[Usage Interface]
        PaymentDetailsInterface[PaymentDetails Interface]
        CreditStatusResponse[CreditStatusResponse]
        CreditAdditionResponse[CreditAdditionResponse]
        UsageRecordResponse[UsageRecordResponse]
    end
    
    %% Database Collections
    subgraph DB[db.ts]
        SubscriptionCollection[Subscription Collection]
        UsageCollection[Usage Collection]
        VirtualProperties[Subscription Virtual Properties]
    end
    
    %% Events
    subgraph Events[events.ts]
        EventEmitter[subscriptionEvents]
        LowCreditsEvent[emitLowCreditsEvent]
        SubscriptionChangeEvent[emitSubscriptionChangeEvent]
        SubscriptionExpiredEvent[emitSubscriptionExpiredEvent]
        SubscriptionRenewedEvent[emitSubscriptionRenewedEvent]
    end
    
    %% Calculator
    subgraph Calculator[calculator.ts]
        CalculatorService[CalculatorService]
        CalculateCosts[calculateCosts]
        CreditsToUsd[creditsToUsd]
        UsdToCredits[usdToCredits]
        CostCalculationInput[CostCalculationInput Interface]
        CostCalculationResult[CostCalculationResult Interface]
    end
    
    %% Config
    subgraph Config[config.ts]
        CostTranspose[COST_TRANSPOSE]
        TokenMUnit[TOKEN_M_UNIT]
        LowCreditsThreshold[LOW_CREDITS_THRESHOLD]
    end
    
    %% Service functions
    subgraph Service[service.ts]
        CheckCreditAllocation[checkCreditAllocation]
        AddCredit[addCredit]
        CheckAndUpdateExpiredSubscriptions[checkAndUpdateExpiredSubscriptions]
        RecordUsage[recordUsage]
    end
    
    %% Functions exporter
    subgraph Functions[functions.ts]
        GetSubscriptionDetails[getSubscriptionDetails]
    end
    
    %% Relationships
    Service --> DB
    Service --> Events
    Service --> Types
    Service --> Calculator
    Service --> Config
    Functions --> DB
    Functions --> Types
    Calculator --> Config
    DB --> Calculator
    
    %% Specific relationships
    CheckCreditAllocation --> LowCreditsEvent
    AddCredit --> SubscriptionChangeEvent
    AddCredit --> SubscriptionRenewedEvent
    CheckAndUpdateExpiredSubscriptions --> SubscriptionExpiredEvent
    RecordUsage --> CalculateCosts
    RecordUsage --> LowCreditsEvent
    VirtualProperties --> CreditsToUsd
    
    %% Database Relationships
    SubscriptionCollection -.-> SubscriptionInterface
    UsageCollection -.-> UsageInterface
```

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant Client
    participant Service
    participant Calculator
    participant DB
    participant Events
    
    %% Credit Allocation Check Flow
    Client->>Service: checkCreditAllocation(userId, minCredits)
    Service->>DB: Query Active Subscription
    DB-->>Service: Return Active Subscription
    alt No Active Subscription
        Service-->>Client: Return No Credits Available
    else Has Active Subscription
        Service->>Service: Calculate Available Credits
        alt Credits Below Threshold
            Service->>Events: Emit Low Credits Event
        end
        Service-->>Client: Return Credit Status
    end
    
    %% Adding Credits Flow
    Client->>Service: addCredit(userId, amount, totalDays, payment)
    Service->>DB: Find Active Subscription
    DB-->>Service: Return Subscription (or null)
    alt Has Active Subscription
        Service->>DB: Update Subscription (extend + add credits)
        DB-->>Service: Return Updated Subscription
        Service->>Events: Emit Subscription Renewed Event
    else No Active Subscription
        Service->>DB: Create New Subscription
        DB-->>Service: Return New Subscription
        Service->>Events: Emit Subscription Change Event
    end
    Service-->>Client: Return Credit Addition Response
    
    %% Usage Recording Flow
    Client->>Service: recordUsage(userId, serviceType, costInputs, modelUsed, details)
    Service->>Calculator: calculateCosts(costInputs)
    Calculator-->>Service: Return Cost Calculation Result
    Service->>DB: Find Active Subscription
    DB-->>Service: Return Subscription (or null)
    alt No Active Subscription
        Service->>DB: Create Usage Record (unpaid)
        DB-->>Service: Return Usage Record
        Service-->>Client: Return Usage Record Response (unpaid)
    else Has Active Subscription
        Service->>DB: Create Usage Record
        DB-->>Service: Return Usage Record
        Service->>DB: Update Subscription Credits Used
        DB-->>Service: Return Updated Subscription
        alt Credits Below Threshold
            Service->>Events: Emit Low Credits Event
        end
        Service-->>Client: Return Usage Record Response
    end
```

## Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Subscription : has
    Subscription ||--o{ Usage : records
    
    User {
        ObjectId _id
        string email
        string password
        string name
    }
    
    Subscription {
        ObjectId _id
        ObjectId user_id
        Date start_date
        Date end_date
        Number total_credits
        Number credits_used
        String status
        Number available_credit
        Number remaining_days
        Number usage_percentage
        Number total_credit_in_usd
        Number used_credit_in_usd
        Number available_credit_in_usd
    }
    
    Usage {
        ObjectId _id
        ObjectId user_id
        ObjectId subscription_id
        String service_type
        Number credit_used
        Number token_count
        String model_used
        String status
        Object details
    }
```

## Event Flow Diagram

```mermaid
flowchart TD
    %% Events
    subgraph Events
        A[Low Credits Event]
        B[Subscription Change Event]
        D[Subscription Expired Event]
        E[Subscription Renewed Event]
    end
    
    %% Triggers
    CheckCreditAllocation --> A
    RecordUsage --> A
    AddCredit --> B
    AddCredit --> E
    CheckAndUpdateExpiredSubscriptions --> D
    
    %% Handlers
    A --> LogLowCredits[Log Low Credits]
    A --> SendNotification[Send Notification]
    B --> UpdateUserProfile[Update User Profile]
    D --> LogExpired[Log Expired]
    D --> DeactivateFeatures[Deactivate Features]
    E --> LogRenewal[Log Renewal]
    E --> EnableFeatures[Enable Features]
```

## Calculator Service Flow

```mermaid
flowchart TD
    %% Calculator Service
    subgraph CalculatorService
        CalculateCosts[calculateCosts]
        CreditsToUsd[creditsToUsd]
        UsdToCredits[usdToCredits]
    end
    
    %% Input/Output
    CostInputs[CostCalculationInput[]] --> CalculateCosts
    CalculateCosts --> CostResult[CostCalculationResult]
    
    %% Calculation Steps
    subgraph CostCalculation
        ForEachItem[Process Each Input Item]
        CalculateUsd[Calculate USD Cost]
        CalculateCredits[Calculate Credit Cost]
        AggregateTotals[Aggregate Totals]
    end
    
    CalculateCosts --> ForEachItem
    ForEachItem --> CalculateUsd
    CalculateUsd --> CalculateCredits
    CalculateCredits --> AggregateTotals
    AggregateTotals --> CostResult
    
    %% Conversion Utilities
    Credits[Credits Amount] --> CreditsToUsd
    CreditsToUsd --> UsdAmount[USD Amount]
    
    UsdValue[USD Value] --> UsdToCredits
    UsdToCredits --> CreditsValue[Credits Value]
    
    %% Config Dependencies
    Config[Configuration Constants] -.-> CalculateCredits
    Config -.-> CreditsToUsd
    Config -.-> UsdToCredits
``` 