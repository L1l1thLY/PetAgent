import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
}

export function MetricCard({ icon: Icon, value, label, description, to, onClick }: MetricCardProps) {
  const isClickable = !!(to || onClick);

  const inner = (
    <div
      className={`glass h-full rounded-2xl px-4 py-4 sm:px-5 sm:py-5 transition-all duration-200${
        isClickable
          ? " hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_var(--glass-specular),0_18px_44px_var(--glass-shadow)] cursor-pointer"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-display text-3xl sm:text-4xl font-normal tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground mt-1.5">
            {label}
          </p>
          {description && (
            <div className="text-xs text-muted-foreground/70 mt-2 hidden sm:block">{description}</div>
          )}
        </div>
        <Icon className="h-4 w-4 text-primary/60 shrink-0 mt-1.5" />
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="no-underline text-inherit h-full" onClick={onClick}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div className="h-full" onClick={onClick}>
        {inner}
      </div>
    );
  }

  return inner;
}
