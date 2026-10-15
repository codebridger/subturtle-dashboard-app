import date from "date-and-time";
import { defineFunction, getCollection } from "@modular-rest/server";
import type { PipelineStage } from "mongoose";

import { DATABASE, BUNDLE_COLLECTION, PHRASE_COLLECTION } from "../../config";
import { assertFeatureEnabled } from "../subscription/enforcement";
import { LangCode, languageFilter } from "../../languages/helper";
import { resolveLanguage } from "../../languages/learner";

/**
 * Progress per language (work list B-23). Both functions take an optional `language`
 * (missing means the active one) and count that language only. The streak stays global:
 * a day with a save in any language keeps it going (ADR-006: one streak per account).
 */
interface UserStatistic {
  /** The language the counts are for. */
  language: LangCode;
  totalPhrases: number;
  totalBundles: number;
  /** Days in a row with at least one phrase saved, in any language (global). */
  streak: number;
}

/** `language: "all"` asks for every language at once (for a global chart). */
export const ALL_LANGUAGES = "all";

// The collections the chart may count. The client used to name any database and
// collection here, which let a signed-in user read collections they should not.
const CHART_COLLECTIONS = [PHRASE_COLLECTION, BUNDLE_COLLECTION];

// Kept phrases (B-32) wait for a language the learner has not added: not progress yet.
const NOT_PENDING = { status: { $ne: "pending" } };

const STREAK_WINDOW_DAYS = 400;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Consecutive days with at least one phrase saved, in any language, counting back from
 * today (UTC days, as the chart). A today with no save yet does not break the run.
 */
export async function globalStreak(userId: string, now = new Date()): Promise<number> {
  const phraseModel = getCollection(DATABASE, PHRASE_COLLECTION);
  const since = date.addDays(now, -STREAK_WINDOW_DAYS);
  const days = (await phraseModel
    .aggregate([
      { $match: { refId: userId, createdAt: { $gte: since }, ...NOT_PENDING } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
    ])
    .exec()) as { _id: string }[];
  const saved = new Set(days.map((d) => d._id));

  let day = new Date(now);
  if (!saved.has(dayKey(day))) day = date.addDays(day, -1);
  let run = 0;
  while (saved.has(dayKey(day))) {
    run++;
    day = date.addDays(day, -1);
  }
  return run;
}

interface ChartDataItem {
  _id: string;
  count: number;
}

type ChartDataPoint = [string, number];

interface GetUserStatisticParams {
  userId: string;
  language?: string;
}

interface GenerateChartDataParams {
  userId: string;
  days: number;
  database: string;
  collection: string;
  /** A language code, "all", or missing for the active language. */
  language?: string;
}

const getUserStatistic = defineFunction({
  name: "getUserStatistic",
  permissionTypes: ["user_access"],
  callback: async ({
    userId,
    language,
  }: GetUserStatisticParams): Promise<UserStatistic> => {
    // Progress insights are a Learner+ entitlement (weekly_insights).
    await assertFeatureEnabled(userId, "weekly_insights");

    const phraseModel = getCollection(DATABASE, PHRASE_COLLECTION);
    const bundleModel = getCollection(DATABASE, BUNDLE_COLLECTION);
    const lang = await resolveLanguage(userId, language);

    const [totalPhrases, totalBundles, streak] = await Promise.all([
      phraseModel.countDocuments({ refId: userId, ...NOT_PENDING, ...languageFilter(lang) }),
      bundleModel.countDocuments({ refId: userId, ...languageFilter(lang) }),
      globalStreak(userId),
    ]);

    return {
      language: lang,
      totalPhrases,
      totalBundles,
      streak,
    };
  },
});

const generateChartDataForInsertionRatio = defineFunction({
  name: "generateChartDataForInsertionRatio",
  permissionTypes: ["user_access"],
  callback: async ({
    userId,
    days,
    database,
    collection,
    language,
  }: GenerateChartDataParams): Promise<ChartDataPoint[]> => {
    // Progress insights are a Learner+ entitlement (weekly_insights).
    await assertFeatureEnabled(userId, "weekly_insights");

    if ((database && database !== DATABASE) || !CHART_COLLECTIONS.includes(collection)) {
      throw new Error(`The chart counts ${CHART_COLLECTIONS.join(" or ")} only.`);
    }
    const collectionModel = getCollection(DATABASE, collection);
    const scope =
      language === ALL_LANGUAGES ? {} : languageFilter(await resolveLanguage(userId, language));
    const pending = collection === PHRASE_COLLECTION ? NOT_PENDING : {};

    const startDate = date.addDays(new Date(), -days);
    const endDate = new Date();

    const dates = [];
    for (let i = 0; i <= days; i++) {
      const day = date.addDays(startDate, i);
      dates.push(day);
    }

    const pipeline: PipelineStage[] = [
      {
        $match: {
          refId: userId,
          ...scope,
          ...pending,
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    const data = (await collectionModel
      .aggregate(pipeline)
      .exec()) as ChartDataItem[];

    const chartData = data.map((item) => [
      // Date
      item._id,
      // Count
      item.count,
    ]) as ChartDataPoint[];

    // Fill missing dates, with meaning full vars
    const filledChartData: ChartDataPoint[] = [];
    let chartDataIndex = 0;
    for (let i = 0; i <= days; i++) {
      const day = date.addDays(startDate, i);
      const chartDataItem = chartData[chartDataIndex];
      if (
        chartDataItem &&
        chartDataItem[0] === date.format(day, "YYYY-MM-DD")
      ) {
        filledChartData.push(chartDataItem);
        chartDataIndex++;
      } else {
        filledChartData.push([date.format(day, "YYYY-MM-DD"), 0]);
      }
    }

    // Remove 0 days between two non 0 days
    const finalChartData = filledChartData.filter((item, index) => {
      if (index === 0 || index === filledChartData.length - 1) {
        return true;
      }

      const previousItem = filledChartData[index - 1];
      const nextItem = filledChartData[index + 1];

      if (previousItem && nextItem && item[1] === 0) {
        return false;
      }
      return true;
    });

    return finalChartData;
  },
});

module.exports.functions = [
  generateChartDataForInsertionRatio,
  getUserStatistic,
];
