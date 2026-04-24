import { api } from "./client";

export type NotificationKind =
  | "budget.warning"
  | "budget.critical"
  | "budget.exceeded"
  | "intervention.severe"
  | "intervention.escalated"
  | "skill.candidate"
  | "plugin.upgrade";

export interface Notification {
  id: string;
  companyId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  payload?: Record<string, unknown>;
}

export interface NotificationsListResponse {
  rows: Notification[];
  unreadCount: number;
}

export const notificationsApi = {
  list: (companyId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.unreadOnly) qs.set("unreadOnly", "true");
    if (typeof opts.limit === "number") qs.set("limit", String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<NotificationsListResponse>(
      `/companies/${companyId}/notifications${suffix}`,
    );
  },
  markRead: (companyId: string, id: string) =>
    api.post<{ ok: boolean }>(`/companies/${companyId}/notifications/${id}/read`, {}),
  markAllRead: (companyId: string) =>
    api.post<{ count: number }>(`/companies/${companyId}/notifications/mark-all-read`, {}),
};
