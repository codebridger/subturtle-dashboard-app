export const FN = {
  getUserStatistic: "getUserStatistic",
  generateChartDataForInsertionRatio: "generateChartDataForInsertionRatio",
};

export type UserStatisticType = {
  totalPhrases: number;
  totalBundles: number;
};

export type ChartDataForInsertionRatioType = [Date, number][];
