"use client";

import { Tabs } from "@heroui/react";
import type { TemplateOption } from "@/lib/visits/messaging";
import { SequencesPanel, type RuleSetRow } from "./sequences-panel";
import { SettingsPanel, type VisitSettingsRow } from "./settings-panel";

export function MessagingManager({
  sets,
  templates,
  templatesError,
  settings,
}: {
  sets: RuleSetRow[];
  templates: TemplateOption[];
  templatesError?: string;
  settings: VisitSettingsRow;
}) {
  return (
    <Tabs>
      <Tabs.ListContainer>
        <Tabs.List aria-label="Visit messages">
          <Tabs.Tab id="sequences">
            Sequences ({sets.length})
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="settings">
            Settings
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel className="pt-4" id="sequences">
        <SequencesPanel sets={sets} templates={templates} templatesError={templatesError} />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="settings">
        <SettingsPanel settings={settings} />
      </Tabs.Panel>
    </Tabs>
  );
}
