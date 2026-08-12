"use client";

import { useActionState, useState } from "react";
import { Eye, EyeSlash } from "@gravity-ui/icons";
import {
  Button,
  Description,
  Input,
  InputGroup,
  Label,
  Surface,
  TextField,
} from "@heroui/react";
import { signIn, type AuthActionState } from "@/lib/actions/auth";
import { OrgLogo } from "@/components/ui/org-logo";

const initialState: AuthActionState = {};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Surface className="w-full max-w-sm rounded-3xl p-6">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <OrgLogo className="h-10 w-auto" />
          <div>
            <h1 className="text-lg font-semibold">Jaipur Rugs Foundation</h1>
            <p className="text-sm text-muted">Admin panel sign in</p>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <TextField isRequired name="email" type="email">
            <Label>Email</Label>
            <Input placeholder="name@jaipurrugs.org" />
          </TextField>
          <TextField isRequired name="password">
            <Label>Password</Label>
            <InputGroup>
              <InputGroup.Input type={isPasswordVisible ? "text" : "password"} />
              <InputGroup.Suffix className="pe-0">
                <Button
                  isIconOnly
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  size="sm"
                  variant="ghost"
                  onPress={() => setIsPasswordVisible((v) => !v)}
                >
                  {isPasswordVisible ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeSlash className="size-4" />
                  )}
                </Button>
              </InputGroup.Suffix>
            </InputGroup>
            <Description>
              First time here? Just enter the password you want to use — your whitelisted email
              sets it up automatically.
            </Description>
          </TextField>
          {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
          {state.message ? <p className="text-sm text-success">{state.message}</p> : null}
          <Button fullWidth isPending={isPending} type="submit">
            Sign in
          </Button>
        </form>
      </Surface>
    </div>
  );
}
