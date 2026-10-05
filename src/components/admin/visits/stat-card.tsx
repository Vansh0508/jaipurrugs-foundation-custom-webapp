import type { ReactNode } from "react";

/** Same card shell as the form metrics cards (src/components/admin/metrics). */
export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 shadow-2xs">
      <div className="flex items-center justify-between text-muted">
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-foreground">{value}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}
