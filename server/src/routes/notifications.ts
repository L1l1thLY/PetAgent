import { Router } from "express";
import { assertCompanyAccess } from "./authz.js";
import type { NotificationStore } from "../notifications/store.js";

export interface NotificationsRouteOptions {
  store: NotificationStore;
}

export function notificationsRoutes(opts: NotificationsRouteOptions) {
  const router = Router();
  const { store } = opts;

  router.get("/companies/:companyId/notifications", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const unreadOnly = req.query.unreadOnly === "true" || req.query.unreadOnly === "1";
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === "string" ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 100)) : 100;
    const rows = await store.list(companyId, { unreadOnly, limit });
    const count = await store.unreadCount(companyId);
    res.json({ rows, unreadCount: count });
  });

  router.post("/companies/:companyId/notifications/:id/read", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const ok = await store.markRead(req.params.id as string);
    res.json({ ok });
  });

  router.post("/companies/:companyId/notifications/mark-all-read", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const count = await store.markAllRead(companyId);
    res.json({ count });
  });

  return router;
}
