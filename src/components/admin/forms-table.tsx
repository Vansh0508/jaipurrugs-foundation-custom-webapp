import Link from "next/link";
import { Chip, Table } from "@heroui/react";
import type { Tables } from "@/lib/types/supabase";

type FormRow = Pick<Tables<"forms">, "id" | "title" | "status" | "slug" | "updated_at">;

const STATUS_COLOR = {
  draft: "default",
  published: "success",
  archived: "warning",
} as const;

export function FormsTable({ forms }: { forms: FormRow[] }) {
  if (forms.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="font-medium">No forms yet</p>
        <p className="text-sm text-muted">Create your first form to get started.</p>
      </div>
    );
  }

  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content aria-label="Forms" className="min-w-[600px]">
          <Table.Header>
            <Table.Column isRowHeader>Title</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Slug</Table.Column>
            <Table.Column>Last updated</Table.Column>
          </Table.Header>
          <Table.Body>
            {forms.map((form) => (
              <Table.Row key={form.id}>
                <Table.Cell>
                  <Link className="font-medium hover:underline" href={`/forms/${form.id}/edit`}>
                    {form.title}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Chip color={STATUS_COLOR[form.status]} size="sm">
                    {form.status}
                  </Chip>
                </Table.Cell>
                <Table.Cell className="text-muted">{form.slug}</Table.Cell>
                <Table.Cell className="text-muted">
                  {new Date(form.updated_at).toLocaleDateString()}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
