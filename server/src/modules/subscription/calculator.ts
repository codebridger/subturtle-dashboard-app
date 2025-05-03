import Decimal from "decimal.js-light";
import { COST_TRANSPOSE, TOKEN_M_UNIT } from "./config";

/**
 * Cost calculation input structure
 */
export interface CostCalculationInput {
  usdCostPerMillion: number; // USD cost per million tokens
  totalTokens: number; // Total tokens consumed
  label: string; // Service or model label
}

/**
 * Result item for each cost calculation
 */
export interface CostCalculationResultItem {
  label: string; // Service or model label
  tokens: number; // Total tokens used
  unitCost: number; // Cost per million tokens in USD
  inUsd: number; // Cost in USD
  inCredits: number; // Cost in credits (transposed)
}

/**
 * Overall cost calculation result
 */
export interface CostCalculationResult {
  items: CostCalculationResultItem[];
  totalTokens: number; // Sum of all tokens
  totalCostInUsd: number; // Sum of all USD costs
  totalCostInCredits: number; // Sum of all credit costs (transposed)
}

/**
 * Calculator service for token usage costs
 */
export class CalculatorService {
  /**
   * Calculate costs for multiple token usages
   *
   * Formula: (cost * transpose) * totalTokens / tokenUnit
   *
   * @param items Array of cost calculation inputs
   * @returns Calculation result with individual and total costs
   */
  public calculateCosts(items: CostCalculationInput[]): CostCalculationResult {
    let runningTotalTokens = new Decimal(0);
    let runningTotalCostInUsd = new Decimal(0);
    let runningTotalCostInCredits = new Decimal(0);

    const resultItems: CostCalculationResultItem[] = items.map((item) => {
      // Create Decimal instances for precision calculation
      const costPerMillionDecimal = new Decimal(item.usdCostPerMillion);
      const itemTokensDecimal = new Decimal(item.totalTokens);
      const transposeDecimal = new Decimal(COST_TRANSPOSE);
      const tokenUnitDecimal = new Decimal(TOKEN_M_UNIT);

      // Calculate cost in USD
      const costInUsdDecimal = costPerMillionDecimal
        .mul(itemTokensDecimal)
        .div(tokenUnitDecimal);

      // Calculate cost in credits (transposed for integer precision)
      const costInCreditsDecimal = costPerMillionDecimal
        .mul(transposeDecimal)
        .mul(itemTokensDecimal)
        .div(tokenUnitDecimal);

      // Update running totals
      runningTotalTokens = runningTotalTokens.plus(item.totalTokens);
      runningTotalCostInUsd = runningTotalCostInUsd.plus(costInUsdDecimal);
      runningTotalCostInCredits =
        runningTotalCostInCredits.plus(costInCreditsDecimal);

      return {
        label: item.label,
        tokens: item.totalTokens,
        unitCost: costPerMillionDecimal.toNumber(),
        inUsd: costInUsdDecimal.toNumber(),
        inCredits: costInCreditsDecimal.toNumber(),
      };
    });

    return {
      items: resultItems,
      totalTokens: runningTotalTokens.toNumber(),
      totalCostInUsd: runningTotalCostInUsd.toNumber(),
      totalCostInCredits: runningTotalCostInCredits.toNumber(),
    };
  }

  /**
   * Convert credits to USD
   *
   * @param credits Amount of credits
   * @returns Equivalent USD amount
   */
  public creditsToUsd(credits: number): number {
    return new Decimal(credits).div(COST_TRANSPOSE).toNumber();
  }

  /**
   * Convert USD to credits
   *
   * @param usd Amount in USD
   * @returns Equivalent credits amount
   */
  public usdToCredits(usd: number): number {
    return new Decimal(usd).mul(COST_TRANSPOSE).toNumber();
  }
}

// Export singleton instance
export const calculatorService = new CalculatorService();
