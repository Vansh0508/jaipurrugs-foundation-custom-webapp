"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs } from "@heroui/react";

const LEFT_TABS = [
  { key: "metrics", label: "Insights", path: "metrics" },
  { key: "submissions", label: "Submissions", path: "submissions" },
] as const;

const RIGHT_TAB = { key: "edit", label: "Edit", path: "edit" } as const;

const ALL_TABS = [...LEFT_TABS, RIGHT_TAB];

export function FormNavTabs({ formId }: { formId: string }) {
  const pathname = usePathname();
  const activeTab = ALL_TABS.find((tab) => pathname?.endsWith(`/${tab.path}`))?.key ?? "edit";

  return (
    <div className="flex w-full items-center justify-between">
      {/* Left side tabs: Insights & Submissions */}
      <Tabs selectedKey={activeTab}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Form insights and submissions">
            {LEFT_TABS.map((tab) => (
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

      {/* Right side tab: Edit */}
      <Tabs selectedKey={activeTab}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Form edit">
            <Tabs.Tab
              key={RIGHT_TAB.key}
              href={`/forms/${formId}/${RIGHT_TAB.path}`}
              id={RIGHT_TAB.key}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              render={(domProps: any) => <Link {...domProps} />}
            >
              {RIGHT_TAB.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </div>
  );
}
