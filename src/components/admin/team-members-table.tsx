"use client";

import { useTransition } from "react";
import { AlertDialog, Button, Chip, Switch, Table } from "@heroui/react";
import { removeTeamMember, setTeamMemberStatus } from "@/lib/actions/team";
import type { Tables } from "@/lib/types/supabase";

type TeamMember = Tables<"team_members">;

export function TeamMembersTable({ members }: { members: TeamMember[] }) {
  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content aria-label="Team members" className="min-w-[500px]">
          <Table.Header>
            <Table.Column isRowHeader>Email</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Remove</Table.Column>
          </Table.Header>
          <Table.Body>
            {members.map((member) => (
              <Table.Row key={member.id}>
                <Table.Cell>{member.email}</Table.Cell>
                <Table.Cell>
                  <StatusToggle member={member} />
                </Table.Cell>
                <Table.Cell>
                  <RemoveButton member={member} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function StatusToggle({ member }: { member: TeamMember }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Switch
        isDisabled={isPending}
        isSelected={member.status === "active"}
        onChange={(isSelected) =>
          startTransition(() => {
            setTeamMemberStatus(member.id, isSelected ? "active" : "inactive");
          })
        }
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
      <Chip color={member.status === "active" ? "success" : "default"} size="sm">
        {member.status === "active" ? "Active" : "Inactive"}
      </Chip>
    </div>
  );
}

function RemoveButton({ member }: { member: TeamMember }) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <Button isDisabled={isPending} size="sm" variant="danger">
        Remove
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Remove {member.email}?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                This permanently deletes this whitelist entry. They will immediately lose access
                and would need to be re-added from scratch to regain it. This cannot be undone.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button
                slot="close"
                variant="danger"
                onPress={() => startTransition(() => removeTeamMember(member.id))}
              >
                Remove
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
