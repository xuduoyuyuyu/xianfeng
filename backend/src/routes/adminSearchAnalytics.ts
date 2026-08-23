import express from "express";
import mongoose from "mongoose";
import SearchAnalyticsEventModel, { SEARCH_RESULT_TYPES } from "../models/SearchAnalyticsEvent";
import User from "../models/User";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
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

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeUser(user: any) {
  return user ? {
    id: String(user._id),
    publicUid: asText(user.publicUid),
    username: asText(user.username),
    mobile: asText(user.mobile),
    name: asText(user.name),
    grade: asText(user.grade),
    gender: asText(user.gender),
    parentRole: asText(user.parentRole),
    role: asText(user.role),
    proStatus: asText(user.proStatus),
    proPlan: asText(user.proPlan),
    city: asText(user.city),
    region: asText(user.region),
    childGrade: asText(user.childGrade),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  } : null;
}

function childAgeFromBirthDate(value: unknown): string {
  const date = new Date(asText(value));
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const month = now.getMonth() - date.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 && age <= 30 ? `${age}岁` : "";
}

function serializeChildren(sync: any) {
  const deleted = new Set((sync?.childProfileDeletions || [])
    .map((item: any) => asText(item?.id || item?.childId))
    .filter(Boolean));
  return (sync?.childProfiles || [])
    .filter((item: any) => !deleted.has(asText(item?.id || item?.childId)))
    .map((item: any) => ({
      id: asText(item?.id || item?.childId),
      name: asText(item?.displayName || item?.name || item?.childName),
      age: asText(item?.accurateAge || item?.age) || childAgeFromBirthDate(item?.birthDate || item?.birthday),
      grade: asText(item?.grade || item?.childGrade),
      city: asText(item?.city),
      region: asText(item?.region),
    }));
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
      identifiedSearches,
      identifiedUsers,
      wordCloudRows,
      dailyKeywordRows,
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
      SearchAnalyticsEventModel.countDocuments({ ...match, userId: { $ne: null } }),
      SearchAnalyticsEventModel.distinct("userId", { ...match, userId: { $ne: null } }),
      SearchAnalyticsEventModel.aggregate([
        { $match: match },
        { $group: { _id: "$normalizedQuery", query: { $first: "$query" }, count: { $sum: 1 } } },
        { $sort: { count: -1, query: 1 } },
        { $limit: 100 },
      ]),
      SearchAnalyticsEventModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$searchedAt", timezone: "Asia/Shanghai" } },
              query: "$normalizedQuery",
            },
            query: { $first: "$query" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.date": 1, count: -1, query: 1 } },
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
        identifiedSearches,
        identifiedUsers: identifiedUsers.filter(Boolean).length,
        identifiedRate: totalSearches ? identifiedSearches / totalSearches : 0,
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
      wordCloud: wordCloudRows
        .filter((row: any) => visibleQuery(row.query))
        .map((row: any) => ({ query: row.query, count: Number(row.count || 0) })),
      dailyKeywords: dailyKeywordRows
        .filter((row: any) => visibleQuery(row.query))
        .reduce((days: any[], row: any) => {
          const date = asText(row?._id?.date);
          let day = days.find((item) => item.date === date);
          if (!day) {
            day = { date, searches: 0, keywords: [] };
            days.push(day);
          }
          const count = Number(row.count || 0);
          day.searches += count;
          if (day.keywords.length < 20) day.keywords.push({ query: row.query, count });
          return days;
        }, []),
      privacy: {
        minimumQueryCount: MIN_QUERY_COUNT,
        retentionDays: 180,
        identitiesStored: true,
        identityRequiresRecordedConsent: true,
      },
    });
  } catch (_error) {
    res.status(500).json({ message: "获取搜索洞察失败" });
  }
});

router.get("/search-analytics/events", async (req, res) => {
  try {
    const days = requestedDays(req.query.days);
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(req.query.pageSize) || 50)));
    const query = asText(req.query.query).slice(0, 120);
    const identity = ["all", "identified", "anonymous"].includes(asText(req.query.identity))
      ? asText(req.query.identity)
      : "all";
    const match: Record<string, any> = {
      searchedAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    };
    if (query) match.query = new RegExp(escapeRegex(query), "i");
    if (identity === "identified") match.userId = { $ne: null };
    if (identity === "anonymous") match.userId = null;

    const [total, events] = await Promise.all([
      SearchAnalyticsEventModel.countDocuments(match),
      SearchAnalyticsEventModel.find(match)
        .select("sessionHash userId query resultCounts totalResults clickedType clickedResultId clickedAt searchedAt identitySource")
        .sort({ searchedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);
    const userIds = Array.from(new Set(events.map((event: any) => asText(event.userId)).filter(mongoose.Types.ObjectId.isValid)));
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } })
        .select("_id publicUid username mobile name grade gender parentRole role proStatus proPlan city region childGrade createdAt updatedAt")
        .lean()
      : [];
    const userById = new Map(users.map((user: any) => [String(user._id), user]));

    res.status(200).json({
      days,
      page,
      pageSize,
      total,
      items: events.map((event: any) => {
        const userId = asText(event.userId);
        return {
          id: String(event._id),
          query: event.query,
          searchedAt: event.searchedAt,
          totalResults: Number(event.totalResults || 0),
          resultCounts: event.resultCounts,
          clickedType: asText(event.clickedType),
          clickedResultId: asText(event.clickedResultId),
          clickedAt: event.clickedAt || null,
          identified: Boolean(userId),
          identitySource: asText(event.identitySource),
          anonymousKey: userId ? "" : `匿名-${asText(event.sessionHash).slice(0, 12).toUpperCase()}`,
          user: userId ? serializeUser(userById.get(userId)) : null,
        };
      }),
    });
  } catch (_error) {
    res.status(500).json({ message: "获取搜索流水失败" });
  }
});

router.get("/search-analytics/users", async (req, res) => {
  try {
    const days = requestedDays(req.query.days);
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const pageSize = Math.max(1, Math.min(50, Math.floor(Number(req.query.pageSize) || 20)));
    const search = asText(req.query.search).slice(0, 80);
    const startAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match: Record<string, any> = { searchedAt: { $gte: startAt }, userId: { $ne: null } };

    if (search) {
      const expression = new RegExp(escapeRegex(search), "i");
      const candidateIds = await User.find({
        $or: [
          { publicUid: expression },
          { username: expression },
          { mobile: expression },
          { name: expression },
          { city: expression },
          { region: expression },
        ],
      }).distinct("_id");
      match.userId = { $in: candidateIds };
    }

    const groupStage = {
      $group: {
        _id: "$userId",
        totalSearches: { $sum: 1 },
        clickedSearches: { $sum: { $cond: [{ $ne: ["$clickedAt", null] }, 1, 0] } },
        zeroResultSearches: { $sum: { $cond: [{ $eq: ["$totalResults", 0] }, 1, 0] } },
        activeDays: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$searchedAt", timezone: "Asia/Shanghai" } } },
        firstSearchedAt: { $min: "$searchedAt" },
        lastSearchedAt: { $max: "$searchedAt" },
      },
    };
    const [countRows, rows] = await Promise.all([
      SearchAnalyticsEventModel.aggregate([{ $match: match }, groupStage, { $count: "total" }]),
      SearchAnalyticsEventModel.aggregate([
        { $match: match },
        groupStage,
        { $sort: { lastSearchedAt: -1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
      ]),
    ]);
    const userIds = rows.map((row: any) => row._id).filter(Boolean);
    const [users, syncRows, queryRows, clickRows] = userIds.length ? await Promise.all([
      User.find({ _id: { $in: userIds } })
        .select("_id publicUid username mobile name grade gender parentRole role proStatus proPlan city region childGrade createdAt updatedAt")
        .lean(),
      UserXiaowanziSync.find({ userId: { $in: userIds } }).select("userId childProfiles childProfileDeletions").lean(),
      SearchAnalyticsEventModel.aggregate([
        { $match: { ...match, userId: { $in: userIds } } },
        { $group: { _id: { userId: "$userId", query: "$normalizedQuery" }, query: { $first: "$query" }, count: { $sum: 1 }, lastSearchedAt: { $max: "$searchedAt" } } },
        { $sort: { count: -1, lastSearchedAt: -1 } },
      ]),
      SearchAnalyticsEventModel.aggregate([
        { $match: { ...match, userId: { $in: userIds }, clickedAt: { $ne: null } } },
        { $group: { _id: { userId: "$userId", type: "$clickedType" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]) : [[], [], [], []];
    const userById = new Map(users.map((user: any) => [String(user._id), user]));
    const syncById = new Map(syncRows.map((sync: any) => [String(sync.userId), sync]));

    res.status(200).json({
      days,
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      items: rows.map((row: any) => {
        const userId = String(row._id);
        const totalSearches = Number(row.totalSearches || 0);
        return {
          user: serializeUser(userById.get(userId)),
          children: serializeChildren(syncById.get(userId)),
          behavior: {
            totalSearches,
            activeDays: Array.isArray(row.activeDays) ? row.activeDays.length : 0,
            firstSearchedAt: row.firstSearchedAt,
            lastSearchedAt: row.lastSearchedAt,
            clickThroughRate: totalSearches ? Number(row.clickedSearches || 0) / totalSearches : 0,
            zeroResultRate: totalSearches ? Number(row.zeroResultSearches || 0) / totalSearches : 0,
            topQueries: queryRows
              .filter((item: any) => String(item?._id?.userId) === userId && visibleQuery(item.query))
              .slice(0, 8)
              .map((item: any) => ({ query: item.query, count: Number(item.count || 0) })),
            preferredResultTypes: clickRows
              .filter((item: any) => String(item?._id?.userId) === userId && asText(item?._id?.type))
              .slice(0, 5)
              .map((item: any) => ({ type: item._id.type, count: Number(item.count || 0) })),
          },
        };
      }),
    });
  } catch (_error) {
    res.status(500).json({ message: "获取用户搜索行为失败" });
  }
});

router.get("/search-analytics/users/:userId", async (req, res) => {
  try {
    const userId = asText(req.params.userId);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ message: "用户编号无效" });
      return;
    }
    const days = requestedDays(req.query.days);
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(Number(req.query.pageSize) || 100)));
    const match = { userId: new mongoose.Types.ObjectId(userId), searchedAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } };
    const [user, sync, total, clickedSearches, zeroResultSearches, events, queryRows, clickRows] = await Promise.all([
      User.findById(userId)
        .select("_id publicUid username mobile name grade gender parentRole role proStatus proPlan city region childGrade createdAt updatedAt")
        .lean(),
      UserXiaowanziSync.findOne({ userId }).select("userId childProfiles childProfileDeletions").lean(),
      SearchAnalyticsEventModel.countDocuments(match),
      SearchAnalyticsEventModel.countDocuments({ ...match, clickedAt: { $ne: null } }),
      SearchAnalyticsEventModel.countDocuments({ ...match, totalResults: 0 }),
      SearchAnalyticsEventModel.find(match)
        .select("query resultCounts totalResults clickedType clickedResultId clickedAt searchedAt identitySource")
        .sort({ searchedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      SearchAnalyticsEventModel.aggregate([
        { $match: match },
        { $group: { _id: "$normalizedQuery", query: { $first: "$query" }, count: { $sum: 1 }, lastSearchedAt: { $max: "$searchedAt" } } },
        { $sort: { count: -1, lastSearchedAt: -1 } },
      ]),
      SearchAnalyticsEventModel.aggregate([
        { $match: { ...match, clickedAt: { $ne: null } } },
        { $group: { _id: "$clickedType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);
    if (!user) {
      res.status(404).json({ message: "用户不存在" });
      return;
    }
    res.status(200).json({
      days,
      page,
      pageSize,
      total,
      user: serializeUser(user),
      children: serializeChildren(sync),
      behaviorProfile: {
        totalSearches: total,
        clickThroughRate: total ? clickedSearches / total : 0,
        zeroResultRate: total ? zeroResultSearches / total : 0,
        topQueries: queryRows.filter((row: any) => visibleQuery(row.query)).slice(0, 30).map((row: any) => ({ query: row.query, count: Number(row.count || 0), lastSearchedAt: row.lastSearchedAt })),
        preferredResultTypes: clickRows.map((row: any) => ({ type: row._id, count: Number(row.count || 0) })),
      },
      events: events.map((event: any) => ({
        id: String(event._id),
        query: event.query,
        resultCounts: event.resultCounts,
        totalResults: Number(event.totalResults || 0),
        clickedType: asText(event.clickedType),
        clickedResultId: asText(event.clickedResultId),
        clickedAt: event.clickedAt || null,
        searchedAt: event.searchedAt,
        identitySource: asText(event.identitySource),
      })),
    });
  } catch (_error) {
    res.status(500).json({ message: "获取用户搜索明细失败" });
  }
});

export default router;
