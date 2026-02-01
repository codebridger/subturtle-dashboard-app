import { describe, it, expect } from "@jest/globals";
import { calculatorService, CostCalculationInput } from "../calculator";

describe("CalculatorService", () => {
  describe("calculateCosts", () => {
    it("should calculate single model usage correctly", () => {
      // Arrange
      const input: CostCalculationInput[] = [
        {
          label: "GPT-4",
          usdCostPerMillion: 20.0,
          totalTokens: 2000,
        },
      ];

      // Act
      const result = calculatorService.calculateCosts(input);

      // Assert
      expect(result.totalCostInUsd).toBe(0.04);
      expect(result.totalCostInCredits).toBe(4000000);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].label).toBe("GPT-4");
    });

    it("should calculate multiple model usage correctly", () => {
      // Arrange
      const inputs: CostCalculationInput[] = [
        {
          label: "GPT-4",
          usdCostPerMillion: 20.0,
          totalTokens: 2000,
        },
        {
          label: "GPT-3.5",
          usdCostPerMillion: 5.0,
          totalTokens: 5000,
        },
      ];

      // Act
      const result = calculatorService.calculateCosts(inputs);

      // Assert
      expect(result.totalCostInUsd).toBe(0.065); // 0.04 + 0.025
      expect(result.totalCostInCredits).toBe(6500000); // 4M + 2.5M
      expect(result.items).toHaveLength(2);
    });
  });

  describe("creditsToUsd", () => {
    it("should convert credits to USD correctly", () => {
      const credits = 50000000; // 50M credits
      const usd = calculatorService.creditsToUsd(credits);
      expect(usd).toBe(0.5); // 50M / 100M (COST_TRANSPOSE)
    });
  });

  describe("usdToCredits", () => {
    it("should convert USD to credits correctly", () => {
      const usd = 0.75;
      const credits = calculatorService.usdToCredits(usd);
      expect(credits).toBe(75000000); // 0.75 * 100M
    });
  });
});
