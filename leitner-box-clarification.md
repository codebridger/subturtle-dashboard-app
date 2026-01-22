# Leitner Box Review System - Implementation Clarification

## Task Clarification:

#### Objective:
Develop a Leitner Box-based flashcard review system capable of handling a large number of phrases efficiently while providing an effective learning and retention process. The system should include mechanisms for dynamically adjusting the number of boxes, categorizing phrases, tracking progress, and determining when phrases can be removed from the iteration.
#### Requirements:
1. **Dynamic Box Structure:**
    *   Implement a dynamic Leitner box system where the number of boxes can be expanded or split as needed to accommodate large volumes of phrases.
    *   Categories of phrases should have their own independent set of Leitner boxes.
    *   Ensure scalability for systems handling over 1,000 phrases.
2. **Phrase Review & Movement Logic:**
    *   Implement logic for moving phrases between boxes based on user performance.
    *   Correctly answered phrases progress to higher-numbered boxes with longer intervals.
    *   Incorrectly answered phrases are moved according to the "Dynamic Relegation" strategy:
        *   First incorrect answer: Move phrase to the previous box.
        *   Subsequent incorrect answer: Move phrase to the first box.
3. **Review Interval Management:**
    *   Use exponential intervals between reviews for higher-numbered boxes (e.g., 1 day, 2 days, 4 days, 8 days, etc.).
    *   Maintain separate review intervals for each category of phrases.
4. **Removal Criteria:**
    *   Define criteria for when a phrase can be removed from the iteration:
        *   Achieving a set number of consecutive correct reviews in the final box (e.g., 5 times).
        *   Passing a time-based threshold (e.g., 60 days) without errors in the final box.
5. **User Interface Considerations:**
    *   Ensure user-friendly display and management of phrases, categories, and boxes.
    *   Provide visual indicators of progress and retention success.
6. **Scalability:**
    *   Allow the system to handle both early-stage users with few phrases and advanced users with thousands of phrases.
7. **Data Persistence:**
    *   Ensure that user progress is saved and retrievable even after logging out or closing the application.
#### Outcome:
The final implementation should provide an efficient and scalable Leitner box system suitable for handling extensive phrase databases. Users should be able to add, categorize, review, and retire phrases effectively based on their progress.


## 1. Implamentation Overview
This document outlines the engineering plan for implementing the Leitner Box Review System within the `Subturtle` application, using `@modular-rest/server` on the backend and Vue.js on the frontend.

## 2. Server-Side Architecture
We will implement two new modules in the `modules/` directory:

### A. Module: `leitner_box`
This module handles all the core logic, data storage, and review calculations.

**Files:**
- `db.ts`: Defines the separate database schema.
- `service.ts`: Contains the business logic (movement, intervals, bundle generation).
- `functions.ts`: Exposes API endpoints for the frontend.

**Database Schema (Unified System):**
We will use a **separate database** `subturtle_leitner` for these collections.

```
// leitner_system collection (Database: subturtle_leitner)
{
  user: ObjectId (ref: 'user'),
  settings: {
    dailyLimit: Number,
    totalBoxes: Number, // Default 5 (min 3, max 10)
  },
  items: [
    {
      phraseId: ObjectId, // Cross-database ref to subturtle_user_content.phrase
      boxLevel: Number, // 1, 2, 3...
      nextReviewDate: Date,
      lastAttemptDate: Date
    }
  ]
}

// review_bundles collection (Database: subturtle_leitner)
{
  user: ObjectId (ref: 'user'),
  createdAt: Date,
  type: 'daily' | 'manual', 
  status: 'pending' | 'completed' | 'expired',
  items: [
    { 
      phraseId: ObjectId, 
      boxLevelAtGeneration: Number // FREEZE-FRAMED: stores the box level when generated
    } 
  ]
}
```
*Note: Using cross-database populate to link to phrases in `user_content`.*

**Functions (`functions.ts`):**
- `getReviewBundle()`: Returns the current batch of phrases to review.
- `submitReviewResult(results: { phraseId: string, correct: boolean }[])`: Updates the box levels for reviewed items.
- `addPhraseToBox(phraseId: string)`: Manually adds a phrase to Box 1.
- `resetBox()`: Resets all progress.
- `getStats()`: Returns box distribution stats for the Dashboard.

### B. Module: `schedule` (General Purpose)
This module manages background tasks using `node-schedule`. It is designed as a **shared service** that triggers API endpoints (internal webhooks) on a schedule.

**Files:**
- `db.ts`: Stores scheduled jobs metadata (name, cronExpression, routePath, method, lastRun, status) for persistence and execution.
- `service.ts`: Wraps `node-schedule` and provides methods like `scheduleJob(name, cronExpression, routePath, method)`. It handles the HTTP request execution.
- `functions.ts`: API to create, list, delete, or manually triggers jobs.

**Mechanism (Webhook/Route Based):**
- **Persistence**: The database stores the **Route Path** (e.g., `/api/v1/leitner-box/functions/generateDailyBundle`), HTTP method, and cron expression.
- **Execution**: When the schedule triggers, the service makes an internal HTTP request (Webhook) to the stored path.
- **Pros**: 
    - Solves the serialization issue (strings are easy to store).
    - Decouples the schedule module from specific implementation details.
    - Allows triggering any API endpoint in the system.

### C. Initialization & Hooks
**Criterion**: "on login step the leitner system is initiated for user".

**Implementation Strategy:**
We will use `authTriggers` passed to `createRest` in `server/src/index.ts`.
1.  **Hook Point**: Add a new trigger to `server/src/triggers.ts`.
2.  **Trigger Type**: Use the `login` trigger (if supported by `authTriggers`) or a similar session-based trigger.
3.  **Action**: Call `LeitnerService.ensureInitialized(userId)` to ensure the user has their settings and initial box items ready.

This keeps the initialization logic completely handled on the server side without requiring extra frontend calls after login.

## 3. Logic & Algorithms

### Phrase Movement (Leitner System)
- **Correct**: `Current Box + 1`. New `nextReviewDate` = `now + (2 ^ (newBox - 1))` days.
- **Incorrect (First)**: `Current Box - 1` (min 1).
- **Incorrect (Subsequent)**: `Box 1`.
- **Completion**: If Box > `MaxBox` (e.g., 5) OR `TimeInBox` > `Threshold` -> Remove from review cycle (mark as "Mastered").

### Universal Reporting & Unified System
- **Unified System**: There is NO separation of boxes by phrase type or category. All phrases live in the same "User's Leitner System".
- **Auto-Entry**: Any phrase reviewed by the user (in a specific Bundle or Daily Review) enters the system.
    - **Logic**:
        - **If Phrase Exists**: Update box level based on result.
        - **If Phrase is New**: Add to **Box 1** and proceed with standard logic.

### Review Bundles
- **Generation**:
    - `node-schedule` triggers daily generation (webhook).
    - Finds items where `nextReviewDate <= Now`.
    - Creates a `ReviewBundle` document.
    - **Freeze-Framed**: The bundle stores a snapshot of the `boxLevel` for each item at the moment of generation. This ensures that even if box settings change mid-bundle, the review session remains consistent.
    - Limit: `MaxBundles` (e.g., 3). If full, oldest *unstarted* bundle is replaced. *In-progress* bundles are kept.

### Settings Change Logic
- **Changing Total Boxes**:
    - **Increase**: No immediate action. Items flow into higher boxes naturally.
    - **Decrease** (e.g., 5 -> 3): All items currently in boxes > 3 (4, 5) are **moved to Box 3**. Their intervals are adjusted to Box 3's settings.
	- Min total is 3 max is 10.

## 4. Frontend Implementation (Vue.js)

**Pages:**
- `pages/practice/flashcards-[id].vue`: **Universal Player**.
    - **Adaptation**:
        - Accepts optional `type=leitner` query param.
        - **UI Updates**: Add "Known" (Check) and "Unknown" (X) buttons.
        - **Logic**: Reports result to the Leitner system on every rating.
- `pages/practice/review.vue`: **Review Dashboard**.
    - Shows current bundles and stats.
    - Links to the Universal Player for review sessions.
- `pages/settings/preferences.vue`: **User Preferences**.
    - Contains `LeitnerSettings` for "Daily Limit" and "Total Boxes".

**Components:**
- `LeitnerDashboard`: Visualization of box distribution.
- `LeitnerSettings`: Configuration form.

**Initialization**:
- Managed server-side via `authTriggers`. No frontend init call required.
