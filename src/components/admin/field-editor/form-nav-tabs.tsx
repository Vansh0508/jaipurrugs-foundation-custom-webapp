"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs } from "@heroui/react";

const TABS = [
  { key: "edit", label: "Edit", path: "edit" },
  { key: "submissions", label: "Submissions", path: "submissions" },
  { key: "metrics", label: "Metrics", path: "metrics" },
] as const;

// Shared Edit/Submissions/Metrics tabs for a form — used by the editor's top
// bar and by the (Phase 6) submissions/metrics placeholder pages. A Server
// Component can't pass a `render` function prop into Tabs.Tab (a Client
// Component), so this lives in its own client component — see
// FormsStatusTabs for the same constraint.
export function FormNavTabs({ formId }: { formId: string }) {
  const pathname = usePathname();
  const activeTab = TABS.find((tab) => pathname?.endsWith(`/${tab.path}`))?.key ?? "edit";

  return (
    <Tabs selectedKey={activeTab}>
      <Tabs.ListContainer>
        <Tabs.List aria-label="Form sections">
          {TABS.map((tab) => (
            <Tabs.Tab
              key={tab.key}
              href={`/forms/${formId}/${tab.path}`}
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
