import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { userApi } from "../services/api";

const SESSION_STORAGE_KEY = "xianfeng_pageview_session_id";
const LAST_TRACKED_KEY = "xianfeng_pageview_last_hit";

function ensureSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const next = `pv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(SESSION_STORAGE_KEY, next);
  return next;
}

function inferDeviceType(userAgent: string): "desktop" | "mobile" | "tablet" | "bot" | "other" {
  const value = userAgent.toLowerCase();
  if (/bot|crawler|spider|slurp/.test(value)) return "bot";
  if (/ipad|tablet|playbook|silk/.test(value)) return "tablet";
  if (/mobile|iphone|android|windows phone|blackberry/.test(value)) return "mobile";
  if (value) return "desktop";
  return "other";
}

function resolvePageTitle(pathname: string): string {
  if (pathname === "/") return "首页";
  if (pathname === "/programs") return "节目列表";
  if (pathname === "/programs/list") return "节目库";
  if (/^\/programs\/[^/]+$/.test(pathname)) return "节目详情";
  if (pathname === "/experts") return "先疯智库";
  if (/^\/experts\/[^/]+$/.test(pathname)) return "嘉宾详情";
  if (pathname === "/login") return "用户登录";
  if (pathname === "/admin") return "后台概览";
  if (pathname === "/admin/login") return "后台登录";

  const adminMap: Record<string, string> = {
    "/admin/programs": "节目管理",
    "/admin/dictionary": "教育词典",
    "/admin/guests": "嘉宾管理",
    "/admin/books": "书单管理",
    "/admin/materials": "资料管理",
    "/admin/users": "用户管理",
    "/admin/user-portrait": "用户画像",
    "/admin/system": "系统信息",
    "/admin/agents": "Agents",
    "/admin/multi-agents": "Multi Agents",
    "/admin/inbox": "站内信",
  };
  return adminMap[pathname] || pathname;
}

const PageViewTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const pagePath = location.pathname || "/";
    const payload = {
      pagePath,
      pageTitle: resolvePageTitle(pagePath),
      sessionId: ensureSessionId(),
      deviceType: inferDeviceType(window.navigator.userAgent || ""),
    };

    const signature = `${payload.sessionId}|${payload.pagePath}`;
    const lastTracked = sessionStorage.getItem(LAST_TRACKED_KEY);
    const lastAt = Number(sessionStorage.getItem(`${LAST_TRACKED_KEY}:ts`) || "0");
    if (lastTracked === signature && Date.now() - lastAt < 8000) {
      return;
    }
    sessionStorage.setItem(LAST_TRACKED_KEY, signature);
    sessionStorage.setItem(`${LAST_TRACKED_KEY}:ts`, String(Date.now()));

    void userApi.trackPageView(payload).catch(() => {
      // Tracking failures should never affect page behavior.
    });
  }, [location.pathname]);

  return null;
};

export default PageViewTracker;
