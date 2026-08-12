"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  Button,
  Input,
  Label,
  Modal,
  Switch,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { addTeamMember, type TeamActionState } from "@/lib/actions/team";

const initialState: TeamActionState = {};

export function AddTeamMemberForm() {
  const [state, formAction, isPending] = useActionState(addTeamMember, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const modal = useOverlayState();

  useEffect(() => {
    if (!state.error) {
      formRef.current?.reset();
      modal.close();
    }
    // Only re-run when the action's result changes — not when `modal` itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button onPress={modal.open}>Add User</Button>
      <Modal.Backdrop isOpen={modal.isOpen} onOpenChange={modal.setOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-sm">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Add user</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form ref={formRef} action={formAction} className="flex flex-col gap-4">
                <TextField isRequired name="email" type="email">
                  <Label>Email</Label>
                  <Input placeholder="name@jaipurrugs.org" />
                </TextField>
                <Switch defaultSelected name="status" value="active">
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    Active
                  </Switch.Content>
                </Switch>
                {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
                <Button fullWidth isPending={isPending} type="submit">
                  Add user
                </Button>
              </form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
