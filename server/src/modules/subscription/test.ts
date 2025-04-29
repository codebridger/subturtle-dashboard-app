import { addCredit, recordUsage, checkDailyAllocation } from "./service";

export async function runSubscriptionTest() {
  console.log("🧪 Running subscription module test...");

  const testUserId = "67e00c53b34c8ee963282440";

  try {
    // Step 1: Add 10 USD credit (100 credits) for 30 days
    console.log("Step 1: Adding credits for test user");
    const addCreditResult = await addCredit(
      testUserId,
      100, // 100 credits ($10)
      30, // 30 days
      {
        paymentMethod: "test",
        transactionId: "test-" + Date.now(),
      }
    );
    console.log("Credit added:", addCreditResult);

    // Step 2: Add some fake transaction records
    console.log("Step 2: Recording some usage");

    // Record 2 minutes of conversation usage
    const conversationResult = await recordUsage(
      testUserId,
      "conversation",
      0.05, // 3 credits (calculated value)
      300, // 300 tokens
      "standard",
      {
        durationSeconds: 120, // 2 minutes in seconds
        complexity: "medium",
      }
    );
    console.log("Conversation usage recorded:", conversationResult);

    // Record 1000 characters of translation
    const translationResult = await recordUsage(
      testUserId,
      "translation",
      0.01, // 0.1 credits (calculated value)
      250, // 250 tokens
      "translation_model",
      {
        characterCount: 1000, // 1000 characters
        languagePair: "en-es", // English to Spanish
        contextType: "document",
      }
    );
    console.log("Translation usage recorded:", translationResult);

    // Step 3: Check availability
    console.log("Step 3: Checking credit availability");
    const availabilityResult = await checkDailyAllocation(testUserId);
    console.log("Credit availability:", availabilityResult);

    console.log("✅ Subscription test completed successfully");
    return {
      success: true,
      credits: addCreditResult,
      conversationUsage: conversationResult,
      translationUsage: translationResult,
      availability: availabilityResult,
    };
  } catch (error: any) {
    console.error("❌ Subscription test failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
