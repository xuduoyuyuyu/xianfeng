import express from "express";
import SearchAnalyticsEventModel, { SEARCH_RESULT_TYPES } from "../models/SearchAnalyticsEvent";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = express.Router();
const ALLOWED_DAYS = new Set([7, 30, 90]);
const MIN_QUERY_COUNT = 2;

router.use(authenticate, requireAdmin);

function requestedDays(value: unknown): number {
  const days = Number(value);
  return ALLOWED_DAYS.has(days) ? days : 30;
}

function visibleQuery(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value !== "[敏感内容已隐藏]";
}

router.get("/search-analytics", async (req, res) => {
  try {
    const days = requestedDays(req.query.days);
    const now = new Date();
    const startAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const midpoint = new Date(startAt.getTime() + (now.getTime() - startAt.getTime()) / 2);
    const match = { searchedAt: { $gte: startAt, $lte: now } };

    const [
      totalSearches,
      uniqueSessions,
      uniqueQueries,
      zeroResultSearches,
      clickedSearches,
      dailyTrend,
      queryRows,
      zeroResultRows,
      resultTypeRows,
      clickTypeRows,
    ] = await Promise.all([
      SearchAnalyticsEventModel.countDocuments(match),
      SearchAnalyticsEventModel.distinct("sessionHash", match),
      SearchAnalyticsEventModel.distinct("normalizedQuery", match),
      SearchAnalyticsEventModel.countDocuments({ ...match, totalResults: 0 }),
      SearchAnalyticsEventModel.countDocuments({ ...match, clickedAt: { $ne: null } }),
      SearchAnalyticsEventModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$searchedAt", timezone: "Asia/Shanghai" } },
            searches: { $sum: 1 },
            zeroResults: { $sum: { $cond: [{ $eq: ["$totalResults", 0] }, 1, 0] } },
            clicks: { $sum: { $cond: [{ $ne: ["$clickedAt", null] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      SearchAnalyticsEventModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$normalizedQuery",
            query: { $first: "$query" },
            count: { $sum: 1 },
            clicks: { $sum: { $cond: [{ $ne: ["$clickedAt", null] }, 1, 0] } },
            zeroResults: { $sum: { $cond: [{ $eq: ["$totalResults", 0] }, 1, 0] } },
            recentCount: { $sum: { $cond: [{ $gte: ["$searchedAt", midpoint] }, 1, 0] } },
            previousCount: { $sum: { $cond: [{ $lt: ["$searchedAt", midpoint] }, 1, 0] } },
          },
        },
        { $match: { count: { $gte: MIN_QUERY_COUNT } } },
        { $sort: { count: -1, query: 1 } },
        { $limit: 40 },
      ]),
      SearchAnalyticsEventModel.aggregate([
        { $match: { ...match, totalResults: 0 } },
        { $group: { _id: "$normalizedQuery", query: { $first: "$query" }, count: { $sum: 1 } } },
        { $match: { count: { $gte: MIN_QUERY_COUNT } } },
        { $sort: { count: -1, query: 1 } },
        { $limit: 20 },
      ]),
      SearchAnalyticsEventModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            programs: { $sum: "$resultCounts.programs" },
            books: { $sum: "$resultCounts.books" },
            materials: { $sum: "$resultCounts.materials" },
            topics: { $sum: "$resultCounts.topics" },
            experts: { $sum: "$resultCounts.experts" },
          },
        },
      ]),
      SearchAnalyticsEventModel.aggregate([
        { $match: { ...match, clickedAt: { $ne: null } } },
        { $group: { _id: "$clickedType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const topQueries = queryRows
      .filter((row: any) => visibleQuery(row.query))
      .slice(0, 20)
      .map((row: any) => ({
        query: row.query,
        count: Number(row.count || 0),
        clicks: Number(row.clicks || 0),
        zeroResults: Number(row.zeroResults || 0),
      }));
    const risingQueries = queryRows
      .filter((row: any) => visibleQuery(row.query) && Number(row.recentCount || 0) >= MIN_QUERY_COUNT)
      .map((row: any) => ({
        query: row.query,
        recentCount: Number(row.recentCount || 0),
        previousCount: Number(row.previousCount || 0),
        change: Number(row.recentCount || 0) - Number(row.previousCount || 0),
      }))
      .filter((row: any) => row.change > 0)
      .sort((a: any, b: any) => b.change - a.change || b.recentCount - a.recentCount)
      .slice(0, 10);
    const resultTypeTotals = resultTypeRows[0] || {};

    res.status(200).json({
      days,
      generatedAt: now.toISOString(),
      summary: {
        totalSearches,
        uniqueSessions: uniqueSessions.length,
        uniqueQueries: uniqueQueries.filter(visibleQuery).length,
        zeroResultSearches,
        zeroResultRate: totalSearches ? zeroResultSearches / totalSearches : 0,
        clickedSearches,
        clickThroughRate: totalSearches ? clickedSearches / totalSearches : 0,
      },
      dailyTrend: dailyTrend.map((row: any) => ({
        date: row._id,
        searches: Number(row.searches || 0),
        zeroResults: Number(row.zeroResults || 0),
        clicks: Number(row.clicks || 0),
      })),
      topQueries,
      risingQueries,
      zeroResultQueries: zeroResultRows
        .filter((row: any) => visibleQuery(row.query))
        .map((row: any) => ({ query: row.query, count: Number(row.count || 0) })),
      resultTypeDistribution: SEARCH_RESULT_TYPES.map((type) => ({
        type,
        count: Number(resultTypeTotals[type] || 0),
      })),
      clickedTypeDistribution: clickTypeRows.map((row: any) => ({
        type: row._id,
        count: Number(row.count || 0),
      })),
      privacy: {
        minimumQueryCount: MIN_QUERY_COUNT,
        retentionDays: 180,
        identitiesStored: false,
      },
    });
  } catch (_error) {
    res.status(500).json({ message: "获取搜索洞察失败" });
  }
});

export default router;
