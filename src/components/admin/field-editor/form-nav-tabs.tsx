"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "metrics", label: "Metrics", path: "metrics" },
  { key: "submissions", label: "Submissions", path: "submissions" },
  { key: "edit", label: "Edit", path: "edit" },
  { key: "insights", label: "AI Insights", path: "insights" },
] as const;

export function FormNavTabs({ formId }: { formId: string }) {
  const pathname = usePathname();

  return (
    <div className="flex w-full items-center justify-between border-b border-border/60">
      <nav aria-label="Form navigation" className="-mb-px flex items-center gap-6">
        {TABS.map((tab) => {
          const href = `/forms/${formId}/${tab.path}`;
          const isActive = pathname?.endsWith(`/${tab.path}`) || (tab.key === "edit" && pathname?.includes("/edit"));

          return (
            <Link
              key={tab.key}
              href={href}
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
