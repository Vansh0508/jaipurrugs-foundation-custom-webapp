"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightFromSquare,
  House,
  LayoutSideContentLeft,
  Persons,
  SquareListUl,
} from "@gravity-ui/icons";
import { Avatar, Button, Dropdown, Header, Label, Separator, Toast } from "@heroui/react";
import { signOut } from "@/lib/actions/auth";
import { OrgLogo } from "@/components/ui/org-logo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/forms", label: "Forms", icon: SquareListUl },
  { href: "/team", label: "Team", icon: Persons },
];

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  function toggleCollapsed() {
    setCollapsed((prev) => !prev);
  }

  return (
    <div className="flex h-screen overflow-hidden gap-2 bg-neutral-100 p-2">
      <Toast.Provider />
      <aside
        className={`flex shrink-0 flex-col gap-1 rounded-2xl bg-neutral-100 p-3 text-neutral-700 transition-[width] duration-200 ${
          collapsed ? "w-16 items-center" : "w-72"
        }`}
      >
        <div className={`mb-4 flex items-center gap-2 ${collapsed ? "flex-col" : "justify-between"}`}>
          {!collapsed && <OrgLogo className="h-6 w-auto" />}
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
            onClick={toggleCollapsed}
            type="button"
          >
            <LayoutSideContentLeft className="size-4" />
          </button>
        </div>

        <nav className="mb-2 flex flex-1 flex-col gap-1 text-sm">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${
                  isActive
                    ? "bg-white font-medium text-neutral-900 shadow-sm"
                    : "text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900"
                }`}
                href={href}
                title={collapsed ? label : undefined}
              >
                <Icon className="size-[1.3rem] shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        <Dropdown>
          <Button
            isIconOnly
            aria-label="Account menu"
            className="w-fit self-start"
            variant="ghost"
          >
            <Avatar size="sm">
              <Avatar.Fallback>{email.charAt(0).toUpperCase()}</Avatar.Fallback>
            </Avatar>
          </Button>
          <Dropdown.Popover placement="top start">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "sign-out") {
                  signOut();
                }
              }}
            >
              <Dropdown.Section>
                <Header className="truncate">{email}</Header>
              </Dropdown.Section>
              <Separator />
              <Dropdown.Item
                className="text-danger data-[hovered]:text-danger"
                id="sign-out"
                textValue="Sign out"
                variant="danger"
              >
                <ArrowRightFromSquare className="size-4 shrink-0 text-danger" />
                <Label className="text-danger">Sign out</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </aside>

      <main className="h-full flex-1 overflow-y-auto rounded-2xl bg-white p-8 shadow-[12px_0_32px_-8px_rgba(0,0,0,0.06),-12px_0_32px_-8px_rgba(0,0,0,0.06)]">
        {children}
      </main>
    </div>
  );
}
