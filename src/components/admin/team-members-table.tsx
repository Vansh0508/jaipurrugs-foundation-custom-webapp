"use client";

import { useState, useTransition } from "react";
import {
  AlertDialog,
  Button,
  Chip,
  Dropdown,
  Table,
  toast,
} from "@heroui/react";
import {
  CircleCheck,
  CircleXmark,
  EllipsisVertical,
  TrashBin,
} from "@gravity-ui/icons";
import { removeTeamMember, setTeamMemberStatus } from "@/lib/actions/team";
import type { Tables } from "@/lib/types/supabase";

type TeamMember = Tables<"team_members">;

export function TeamMembersTable({ members }: { members: TeamMember[] }) {
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center bg-white">
        <p className="font-semibold text-foreground">No team members found</p>
        <p className="text-sm text-muted">
          Add a team member using the form above to grant access.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="Team members" className="min-w-[600px] w-full table-fixed">
          <Table.Header>
            <Table.Column isRowHeader>Email</Table.Column>
            <Table.Column className="w-36">Status</Table.Column>
            <Table.Column className="w-20 text-right">Actions</Table.Column>
          </Table.Header>
          <Table.Body>
            {members.map((member) => (
              <TeamMemberRow key={member.id} member={member} />
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function TeamMemberRow({ member }: { member: TeamMember }) {
  const [isPending, startTransition] = useTransition();
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  function handleAction(key: string) {
    if (key === "toggle-status") {
      const nextStatus = member.status === "active" ? "inactive" : "active";
      startTransition(async () => {
        try {
          await setTeamMemberStatus(member.id, nextStatus);
          toast.success(
            nextStatus === "active"
              ? `${member.email} activated`
              : `${member.email} deactivated`
          );
        } catch {
          toast.danger("Could not update member status.");
        }
      });
    } else if (key === "remove") {
      setIsAlertOpen(true);
    }
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeTeamMember(member.id);
        toast.success(`Removed ${member.email}`);
        setIsAlertOpen(false);
      } catch {
        toast.danger("Could not remove team member.");
      }
    });
  }

  return (
    <Table.Row>
      <Table.Cell>
        <span className="font-medium text-foreground">{member.email}</span>
      </Table.Cell>
      <Table.Cell>
        <Chip color={member.status === "active" ? "success" : "default"} size="sm">
          {member.status === "active" ? "Active" : "Inactive"}
        </Chip>
      </Table.Cell>
      <Table.Cell className="text-right">
        <Dropdown>
          <Button
            aria-label="Member actions"
            className="h-8 w-8 bg-transparent text-muted hover:text-foreground"
            isDisabled={isPending}
            isIconOnly
            size="sm"
            variant="ghost"
          >
            <EllipsisVertical className="size-4" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              aria-label="Member actions menu"
              onAction={(key) => handleAction(key as string)}
            >
              <Dropdown.Item
                id="toggle-status"
                textValue={
                  member.status === "active"
                    ? "Deactivate member"
                    : "Activate member"
                }
              >
                <span className="inline-flex items-center gap-2">
                  {member.status === "active" ? (
                    <>
                      <CircleXmark className="size-3.5 text-muted" />
                      Deactivate member
                    </>
                  ) : (
                    <>
                      <CircleCheck className="size-3.5 text-success" />
                      Activate member
                    </>
                  )}
                </span>
              </Dropdown.Item>
              <Dropdown.Item id="remove" textValue="Remove member" variant="danger">
                <span className="inline-flex items-center gap-2 text-danger font-medium">
                  <TrashBin className="size-3.5 text-danger" />
                  Remove member
                </span>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        <AlertDialog isOpen={isAlertOpen} onOpenChange={setIsAlertOpen}>
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
                    This permanently deletes this whitelist entry. They will immediately
                    lose access and would need to be re-added from scratch to regain it.
                    This cannot be undone.
                  </p>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button
                    slot="close"
                    variant="tertiary"
                    onPress={() => setIsAlertOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    isDisabled={isPending}
                    variant="danger"
                    onPress={handleRemove}
                  >
                    Remove
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </Table.Cell>
    </Table.Row>
  );
}
