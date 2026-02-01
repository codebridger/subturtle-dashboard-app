# Leitner Box Review System - Implementation Clarification

## Task Clarification:

#### Objective:
Develop a Leitner Box-based flashcard review system capable of handling a large number of phrases efficiently while providing an effective learning and retention process. The system should include mechanisms for dynamically adjusting the number of boxes, categorizing phrases, tracking progress, and determining when phrases can be removed from the iteration.
#### Requirements:
1. **Dynamic Box Structure:**
    *   Implement a dynamic Leitner box system where the number of boxes can be expanded or split as needed to accommodate large volumes of phrases.
    *   Categories of phrases play as a parallel review phrase beside the actual review list, any correct answer push the phrase to the next box and any incorrect answer push the phrase to the previous box. 
    *   Ensure scalability for systems handling over 5,000 phrases.
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

## 2. Server-Side Architecture & Module Usecases
The system relies on the interplay of three distinct modules.

### A. Module: `leitner_box` (The Logic Engine)
**Role**: Handles the *mathematics* and *storage* of spaced repetition. It doesn't care *when* or *how* the user reviews, only *what* is due and *how* to update progress.
**Usecase**: "I performed a review on Phrase X, result: Correct. Update its level."
**Relation**:
- **To Board**: Provides data ("User has 15 items due").
- **To Schedule**: None directly (passive module).

**Database Schema (`leitner_system` collection in `subturtle_leitner`):**
```typescript
{
  /** Reference to the User owner of this system */
  user: ObjectId (ref: 'user'),
  
  /** User-configured settings affecting the algo */
  settings: {
    /** Soft limit for suggested daily reviews (e.g., 20) */
    dailyLimit: Number,
    /** Max box level before 'Mastered'. Default 5 (min 3, max 10) */
    totalBoxes: Number,
  },
  
  /** Array of all phrases currently tracked in the system */
  items: [
    {
      /** Link to the Phrase in `subturtle_user_content` DB */
      phraseId: ObjectId, 
      /** Current Box Level (1 = Daily, 5 = Mastered) */
      boxLevel: Number, 
      /** The exact timestamp when this item becomes due for review */
      nextReviewDate: Date,
      /** Timestamp of the last review attempt */
      lastAttemptDate: Date
    }
  ]
}
```

### B. Module: `board` (The State/Presentation Layer)
**Role**: Manages the "Activity Board" UI state. It acts as the *Brain* that decides what the user should focus on. It persists notification states (toasts) so they survive refreshes.
**Usecase**: "The user logged in. Show them a 'Hot' toast for Leitner Review because they have due items."
**Relation**:
- **To Leitner**: Queries `LeitnerService.getDueCount()` to determine if a toast is needed.
- **To Schedule**: Receives "Wake Up" triggers to refresh its state.

**Database Schema (`board_activities` collection in `subturtle_board`):**
```typescript
{
  /** Reference to the User */
  user: ObjectId (ref: 'user'),
  
  /** List of tracked activities on the board */
  activities: [
    {
      /** The identifier for the type of activity */
      type: 'leitner_review', // | 'ai_lecture' | 'ai_practice'
      
      /** 
       * Controls notification duplication behavior:
       * - 'singleton': Only one active toast of this type (e.g. Leitner Review)
       * - 'unique': Multiple toasts allowed if refIds differ (e.g. Course A, Course B)
       */
      toastType: 'singleton' | 'unique',
      
      /** Optional ID for 'unique' types (e.g., Lecture ID) */
      refId: String,
      
      /** Current UI State: 'toasted' = show alert, 'idle' = normal display */
      state: 'idle' | 'toasted', 
      
      /** When this state was last computed */
      lastUpdated: Date,
      
      /** Snapshot data for the UI (e.g., preventing re-querying Leitner DB) */
      meta: {
          dueCount: Number, 
          nextCheck: Date
      }
    }
  ]
}
```

### C. Module: `schedule` (The Pulse/Trigger)
**Role**: A general-purpose background job runner. It knows *nothing* about business logic; it only knows *endpoints* and *times*.
**Usecase**: "Every hour, trigger the `board/refresh` webhook for all active users."
**Relation**:
- **To Board**: Calls `BoardService.refresh()` (via webhook).
- **To Leitner**: No direct relation.

### D. Initialization & Hooks
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

### Dynamic Board & Activities
- **Persistence**: Activity states are stored in the DB.
- **Toast Types**:
    - **Singleton**: Only one active toast of this kind (e.g., "Leitner Review"). If triggered again, it just updates metadata (e.g., due count).
    - **Unique**: Can have multiple distinct toasts (e.g., "Lecture: Intro to AI", "Lecture: Advanced JS").
- **"Toasting"**:
    - **Trigger**: Schedule runs daily (or hourly) -> `BoardService.refresh()`.
    - **Logic**: Checks `LeitnerService`. If items are due, sets Activity State to `toasted` with metadata (e.g., "15 items due").
- **"Consumption" (State Change)**:
    - User clicks "Review" or enters the activity -> **Toast is Removed** (State -> `consumed/idle`).
    - **Logic**: The act of *starting* the activity satisfies the prompt.

### Dynamic Review Logic
- **No Freeze-Frames**: We do NOT store "Bundles" in the DB.
- **On Click "Review"**:
    - Frontend requests `leitner/review-items`.
    - Server queries `leitner_items` where `nextReviewDate <= Now`.
    - Server returns the list (up to `DailyLimit` or more if user requests).
- **Daily Limit**:
    - Acts as a "Target" or "Soft Limit".
    - The Board says "You have X items due".
    - If `Due > DailyLimit`, we show `DailyLimit` first, but allow user to continue reviewing the rest ("Overtime").

### Settings Change Logic
- **Changing Total Boxes**:
    - **Increase**: No immediate action. Items flow into higher boxes naturally.
    - **Decrease** (e.g., 5 -> 3): All items currently in boxes > 3 (4, 5) are **moved to Box 3**. Their intervals are adjusted to Box 3's settings.
	- Min total is 3 max is 10.

## 4. Frontend Implementation (Vue.js)

**Pages:**
- `pages/board/index.vue`: **Activity Board**.
    - Lists activities (Leitner, Lecture, Practice).
    - Highlights due activities.
- `pages/practice/flashcards-[id].vue`: **Universal Player**.
    - **Adaptation**:
        - Accepts optional `type=leitner` query param.
        - If `type=leitner`, it fetches dynamic due items from `leitner/review-items`.
        - **UI Updates**: Add "Known" (Check) and "Unknown" (X) buttons.
        - **Logic**: Reports result to the Leitner system on every rating.
- `pages/settings/preferences.vue`: **User Preferences**.
    - Contains `LeitnerSettings` for "Daily Limit" and "Total Boxes".

**Components:**
- `LeitnerDashboard`: Visualization of box distribution (can be on Board).
- `LeitnerSettings`: Configuration form.

**Initialization**:
- Managed server-side via `authTriggers`. No frontend init call required.
