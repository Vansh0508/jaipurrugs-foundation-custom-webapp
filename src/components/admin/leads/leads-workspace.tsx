"use client";

import { Tabs } from "@heroui/react";
import type { Lead, LeadAttribute, LeadList } from "@/lib/leads/fields";
import { LeadAttributesPanel } from "./lead-attributes-panel";
import { LeadListsPanel } from "./lead-lists-panel";
import { LeadsTable } from "./leads-table";

export type LeadRow = Lead & { listIds: string[] };
export type LeadListRow = LeadList & { memberCount: number };

export function LeadsWorkspace({
  leads,
  lists,
  attributes,
  truncated,
}: {
  leads: LeadRow[];
  lists: LeadListRow[];
  attributes: LeadAttribute[];
  truncated: boolean;
}) {
  return (
    <Tabs>
      <Tabs.ListContainer>
        <Tabs.List aria-label="Leads">
          <Tabs.Tab id="leads">
            Leads ({leads.length}
            {truncated ? "+" : ""})
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="lists">
            Lists ({lists.length})
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="attributes">
            Custom attributes ({attributes.filter((a) => a.is_active).length})
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel className="pt-4" id="leads">
        <LeadsTable attributes={attributes} leads={leads} lists={lists} truncated={truncated} />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="lists">
        <LeadListsPanel lists={lists} />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="attributes">
        <LeadAttributesPanel attributes={attributes} />
      </Tabs.Panel>
    </Tabs>
  );
}
