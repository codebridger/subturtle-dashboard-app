/**
 * Test script for the translation module with structured output
 *
 * To run this test:
 * 1. Make sure your .env file has OPENROUTER_API_KEY set
 * 2. Run: ts-node src/modules/translation/test.ts
 */

import dotenv from "dotenv";
import path from "path";
import { openRouter, OPENROUTER_MODELS } from "../../utils/openrouter";
import { LanguageLearningData } from "./types";
import { LanguageLearningDataSchema } from "./schema";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function testTranslation() {
  console.log("Testing translation module with structured output...");

  // Sample text to translate
  const phrase = "your network";
  const context =
    "this is really hard to find a person to do hard job, do you have any one in your network?";
  const sourceLanguage = "en";
  const targetLanguage = "fa";

  // System and user prompts
  const systemPrompt = `You are a language learning AI that analyzes and translates text.
  Take the marked phrase from the context and provide a detailed analysis following the provided JSON schema structure.
  Ensure your response follows the schema exactly and contains all required fields.`;

  const userPrompt = `
  Analyze and translate this marked phrase within its context:
  
  Marked phrase: "${phrase}"
  Context: "${context}"
  Source language: ${sourceLanguage}
  Target language: ${targetLanguage}`;

  try {
    console.log("Sending request to OpenRouter...");

    // Test using the Zod-integrated structured output method
    const result =
      await openRouter.createStructuredOutputWithZod<LanguageLearningData>(
        {
          model: OPENROUTER_MODELS.TRANSLATION,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        },
        LanguageLearningDataSchema, // Pass Zod schema directly
        "language_learning_data",
        true
      );

    console.log("Response received and validated successfully!");
    console.log("\nResult (automatically validated with Zod):");
    console.log(JSON.stringify(result, null, 2));

    // Display the data structure
    console.log("\nStructure Summary:");
    console.log(`- Marked text: "${result.marked_text}"`);
    console.log(`- Translation: "${result.translation.marked_text}"`);
    console.log(`- Type: ${result.linguistic_data.type}`);
    console.log(`- Definition: "${result.linguistic_data.definition}"`);
    console.log(`- Example count: ${result.linguistic_data.examples.length}`);
    console.log(
      `- First example: "${result.linguistic_data.examples[0].example}"`
    );

    if (
      result.linguistic_data.related_expressions &&
      result.linguistic_data.related_expressions.length > 0
    ) {
      console.log(
        `- Related expressions: ${result.linguistic_data.related_expressions.length}`
      );
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testTranslation().catch(console.error);
