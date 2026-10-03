"use client";

import { useMemo, useState } from "react";
import { Pencil } from "@gravity-ui/icons";
import { Button, Chip, Label, ListBox, SearchField, Select, Table } from "@heroui/react";
import { leadAttributeValues, type LeadAttribute } from "@/lib/leads/fields";
import { formatPhone } from "@/lib/mastra/phone";
import { LeadEditModal } from "./lead-edit-modal";
import type { LeadListRow, LeadRow } from "./leads-workspace";

const SOURCE_LABEL: Record<string, string> = {
  form: "Form",
  whatsapp_agent: "WhatsApp agent",
  manual: "Manual",
};

const ALL_LISTS = "__all";
// Columns beyond these get cramped; the edit modal shows everything.
const MAX_ATTRIBUTE_COLUMNS = 3;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function LeadsTable({
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
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<string>(ALL_LISTS);
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeAttributes = attributes.filter((a) => a.is_active);
  const columns = activeAttributes.slice(0, MAX_ATTRIBUTE_COLUMNS);
  const editing = leads.find((l) => l.id === editingId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (listFilter !== ALL_LISTS && !lead.listIds.includes(listFilter)) return false;
      if (!q) return true;
      const values = Object.values(leadAttributeValues(lead)).map(String);
      return [lead.name ?? "", lead.phone, ...values].some((v) => v.toLowerCase().includes(q));
    });
  }, [leads, query, listFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SearchField aria-label="Search leads" className="w-72" value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search name, phone or details…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Select className="w-56" value={listFilter} onChange={(key) => setListFilter(String(key ?? ALL_LISTS))}>
          <Label>List</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id={ALL_LISTS} textValue="All leads">
                All leads
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {lists.map((list) => (
                <ListBox.Item key={list.id} id={list.id} textValue={list.name}>
                  {list.name} ({list.memberCount})
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {truncated ? (
          <p className="pb-2 text-xs text-muted">Showing the 1,000 most recently updated leads.</p>
        ) : null}
      </div>

      {leads.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center">
          <p className="text-sm font-medium">No leads yet</p>
          <p className="max-w-md text-sm text-muted">
            Leads appear when a form with lead sync turned on is submitted (set it up in a form&apos;s
            &ldquo;Lead sync&rdquo; tab), or when the WhatsApp agent saves a contact&apos;s details.
          </p>
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Leads" className="w-full min-w-[720px]">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                <Table.Column>Phone</Table.Column>
                {columns.map((attr) => (
                  <Table.Column key={attr.key}>{attr.label}</Table.Column>
                ))}
                <Table.Column>Lists</Table.Column>
                <Table.Column>Source</Table.Column>
                <Table.Column>Updated</Table.Column>
                <Table.Column className="w-14 text-right">
                  <span className="sr-only">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {filtered.map((lead) => {
                  const values = leadAttributeValues(lead);
                  return (
                    <Table.Row key={lead.id}>
                      <Table.Cell className="font-medium">{lead.name ?? <span className="text-muted">—</span>}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap">{formatPhone(lead.phone)}</Table.Cell>
                      {columns.map((attr) => (
                        <Table.Cell key={attr.key}>
                          {values[attr.key] !== undefined && values[attr.key] !== null ? (
                            String(values[attr.key])
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </Table.Cell>
                      ))}
                      <Table.Cell>
                        <div className="flex flex-wrap gap-1">
                          {lead.listIds.map((id) => {
                            const list = lists.find((l) => l.id === id);
                            return list ? (
                              <Chip key={id} size="sm" variant="soft">
                                {list.name}
                              </Chip>
                            ) : null;
                          })}
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-muted">{SOURCE_LABEL[lead.source] ?? lead.source}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-muted">{formatDate(lead.updated_at)}</Table.Cell>
                      <Table.Cell className="text-right">
                        <Button isIconOnly aria-label="Edit lead" size="sm" variant="ghost" onPress={() => setEditingId(lead.id)}>
                          <Pencil className="size-4" />
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      {filtered.length === 0 && leads.length > 0 ? (
        <p className="text-center text-sm text-muted">No leads match.</p>
      ) : null}

      <LeadEditModal
        attributes={attributes}
        lead={editing}
        lists={lists}
        onClose={() => setEditingId(null)}
      />
    </div>
  );
}
