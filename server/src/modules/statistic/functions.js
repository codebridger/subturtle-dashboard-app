const date = require("date-and-time");
const { defineFunction, getCollection } = require("@modular-rest/server");

const {
  DATABASE,
  BUNDLE_COLLECTION,
  PHRASE_COLLECTION,
} = require("../../config");

const getUserStatistic = defineFunction({
  name: "getUserStatistic",
  permissionTypes: ["user_access"],
  callback: async ({ userId }) => {
    const phraseModel = getCollection(DATABASE, PHRASE_COLLECTION);
    const bundleModel = getCollection(DATABASE, BUNDLE_COLLECTION);

    const totalPhrases = await phraseModel.countDocuments({ refId: userId });
    const totalBundles = await bundleModel.countDocuments({ refId: userId });

    return {
      totalPhrases,
      totalBundles,
    };
  },
});

const generateChartDataForInsertionRatio = defineFunction({
  name: "generateChartDataForInsertionRatio",
  permissionTypes: ["user_access"],
  callback: async ({ userId, days, database, collection }) => {
    const collectionModel = getCollection(database, collection);

    const startDate = date.addDays(new Date(), -days);
    const endDate = new Date();

    const dates = [];
    for (let i = 0; i <= days; i++) {
      const day = date.addDays(startDate, i);
      dates.push(day);
    }

    const pipeline = [
      {
        $match: {
          refId: userId,
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

    const data = await collectionModel.aggregate(pipeline).exec();

    const chartData = data.map((item) => [
      // Date
      item._id,
      // Count
      item.count,
    ]);

    // Fill missing dates, with meaning full vars
    const filledChartData = [];
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
      if (index == 0 || index == filledChartData.length - 1) {
        return true;
      }

      const previousItem = filledChartData[index - 1];
      const nextItem = filledChartData[index + 1];

      if (!!previousItem && !!nextItem && item[1] == 0) {
        return false;
      } else return true;
    });

    return finalChartData;
  },
});

module.exports.functions = [
  generateChartDataForInsertionRatio,
  getUserStatistic,
];
