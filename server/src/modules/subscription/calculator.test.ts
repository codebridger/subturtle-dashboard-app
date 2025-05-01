import { calculatorService, CostCalculationInput } from "./calculator";

/**
 * Simple tests for the calculator service
 */

// Test 1: Calculate cost for a single model usage
console.log("Test 1: Single model usage");
const singleTest: CostCalculationInput[] = [
  {
    label: "GPT-4",
    usdCostPerMillion: 20.0, // $20 per million tokens
    totalTokens: 2000, // 2000 tokens
  },
];

const singleResult = calculatorService.calculateCosts(singleTest);
console.log(JSON.stringify(singleResult, null, 2));
// Expected: 2000 tokens should cost $0.04 (20 * 2000 / 1M)
// And 4M credits (20 * 100M * 2000 / 1M)

// Test 2: Calculate costs for multiple model usages
console.log("\nTest 2: Multiple model usage");
const multipleTest: CostCalculationInput[] = [
  {
    label: "GPT-4",
    usdCostPerMillion: 20.0, // $20 per million tokens
    totalTokens: 2000, // 2000 tokens
  },
  {
    label: "GPT-3.5",
    usdCostPerMillion: 5.0, // $5 per million tokens
    totalTokens: 5000, // 5000 tokens
  },
  {
    label: "Claude",
    usdCostPerMillion: 15.0, // $15 per million tokens
    totalTokens: 3000, // 3000 tokens
  },
];

const multipleResult = calculatorService.calculateCosts(multipleTest);
console.log(JSON.stringify(multipleResult, null, 2));
// Expected total cost: $0.04 + $0.025 + $0.045 = $0.11
// And credits: 4M + 2.5M + 4.5M = 11M credits

// Test 3: Conversion utilities
console.log("\nTest 3: Conversion utilities");
const credits = 50_000_000; // 50M credits
const usd = calculatorService.creditsToUsd(credits);
console.log(`${credits} credits = $${usd}`);
// Expected: 50M credits = $0.5

const dollars = 0.75; // $0.75
const convertedCredits = calculatorService.usdToCredits(dollars);
console.log(`$${dollars} = ${convertedCredits} credits`);
// Expected: $0.75 = 75M credits
