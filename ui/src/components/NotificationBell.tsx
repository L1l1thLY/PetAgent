import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import {
  notificationsApi,
  type Notification,
} from "../api/notifications";
import { useCompany } from "../context/CompanyContext";
import { Button } from "@/components/ui/button";

/**
 * Minimal notification bell for the top bar (spec §17.6).
 * Polls every 30s when a company is selected; dropdown on click.
 */
export function NotificationBell() {
  const { selectedCompanyId } = useCompany();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", selectedCompanyId ?? "__none__"],
    queryFn: () => notificationsApi.list(selectedCompanyId ?? "", { limit: 25 }),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (!selectedCompanyId) return;
      await notificationsApi.markRead(selectedCompanyId, id);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["notifications", selectedCompanyId ?? "__none__"],
      }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) return { count: 0 };
      const result = await notificationsApi.markAllRead(selectedCompanyId);
      return result ?? { count: 0 };
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["notifications", selectedCompanyId ?? "__none__"],
      }),
  });

  if (!selectedCompanyId) return null;

  const unread = query.data?.unreadCount ?? 0;
  const rows = query.data?.rows ?? [];

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        className="relative"
      >
        {unread > 0 ? (
          <BellRing className="h-5 w-5" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover p-2 shadow-lg z-50">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </Button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No notifications
            </p>
          ) : (
            <ul className="space-y-1">
              {rows.map((row) => (
                <li key={row.id}>
                  <NotificationItem
                    notification={row}
                    onRead={() => markRead.mutate(row.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: () => void;
}) {
  const unread = notification.readAt === null;
  const tone = kindTone(notification.kind);
  return (
    <button
      type="button"
      onClick={onRead}
      disabled={!unread}
      className={`flex w-full flex-col items-start gap-1 rounded px-2 py-2 text-left text-sm ${unread ? "hover:bg-muted" : "opacity-60"}`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
          <span className="font-medium">{notification.title}</span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatRelative(notification.createdAt)}
        </span>
      </div>
      {notification.body && (
        <p className="text-xs text-muted-foreground">{notification.body}</p>
      )}
    </button>
  );
}

function kindTone(kind: Notification["kind"]): { dot: string } {
  switch (kind) {
    case "budget.exceeded":
    case "intervention.severe":
      return { dot: "bg-red-500" };
    case "budget.critical":
    case "intervention.escalated":
      return { dot: "bg-orange-500" };
    case "budget.warning":
      return { dot: "bg-yellow-500" };
    default:
      return { dot: "bg-sky-500" };
  }
}

function formatRelative(iso: string): string {
  const created = new Date(iso);
  if (isNaN(created.getTime())) return "";
  const diffMs = Date.now() - created.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
