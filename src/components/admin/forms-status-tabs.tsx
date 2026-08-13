"use client";

import Link from "next/link";
import type { Enums } from "@/lib/types/supabase";

type StatusFilter = Enums<"form_status"> | "all";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

function buildHref(status: StatusFilter, q: string | undefined) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/forms?${query}` : "/forms";
}

export function FormsStatusTabs({ status, q }: { status: StatusFilter; q?: string }) {
  return (
    <div className="border-b border-border/60">
      <nav aria-label="Filter forms by status" className="-mb-px flex items-center gap-6">
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.key;
          return (
            <Link
              key={tab.key}
              href={buildHref(tab.key, q)}
              className={`inline-flex items-center border-b-2 py-2.5 text-sm transition-colors ${
                isActive
                  ? "border-accent font-semibold text-foreground"
                  : "border-transparent font-medium text-muted hover:border-border/80 hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
