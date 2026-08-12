"use client";

import Link from "next/link";
import { Tabs } from "@heroui/react";
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

// A Server Component can't pass a `render` function prop into this Client
// Component (functions aren't serializable across the RSC boundary), so the
// Tabs.Tab render-function closures are built here instead — see the 500 this
// caused when Tabs lived directly in app/(admin)/forms/page.tsx.
export function FormsStatusTabs({ status, q }: { status: StatusFilter; q?: string }) {
  return (
    <Tabs selectedKey={status}>
      <Tabs.ListContainer>
        <Tabs.List aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <Tabs.Tab
              key={tab.key}
              href={buildHref(tab.key, q)}
              id={tab.key}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              render={(domProps: any) => <Link {...domProps} />}
            >
              {tab.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
