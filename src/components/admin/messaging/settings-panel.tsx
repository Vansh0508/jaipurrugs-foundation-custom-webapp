"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button, Description, Input, Label, Switch, TextField, toast } from "@heroui/react";
import { updateVisitSettings } from "@/lib/actions/messaging";

export interface VisitSettingsRow {
  sends_enabled: boolean;
  dry_run: boolean;
  auto_complete_after_hours: number;
  quiet_start: string;
  quiet_end: string;
  expiry_days: number;
}

const hhmm = (t: string) => t.slice(0, 5);

export function SettingsPanel({ settings }: { settings: VisitSettingsRow }) {
  const router = useRouter();
  const [sendsEnabled, setSendsEnabled] = useState(settings.sends_enabled);
  const [dryRun, setDryRun] = useState(settings.dry_run);
  const [autoComplete, setAutoComplete] = useState(String(settings.auto_complete_after_hours));
  const [quietStart, setQuietStart] = useState(hhmm(settings.quiet_start));
  const [quietEnd, setQuietEnd] = useState(hhmm(settings.quiet_end));
  const [expiryDays, setExpiryDays] = useState(String(settings.expiry_days));
  const [isPending, setIsPending] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);

  const goingLive = sendsEnabled && !dryRun && (!settings.sends_enabled || settings.dry_run);

  async function save() {
    setIsPending(true);
    const result = await updateVisitSettings({
      sendsEnabled,
      dryRun,
      autoCompleteAfterHours: autoComplete,
      quietStart,
      quietEnd,
      expiryDays,
    });
    setIsPending(false);
    setConfirmLive(false);
    if (result.error) return toast.danger(result.error);
    toast.success("Settings saved");
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-2xs">
        <div>
          <h3 className="text-sm font-semibold">Sending</h3>
          <p className="text-xs text-muted">The master controls. Both start in the safe position: nothing is sent.</p>
        </div>
        <Switch isSelected={sendsEnabled} onChange={setSendsEnabled}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Scheduled messaging is on
          </Switch.Content>
        </Switch>
        <Description className="-mt-2">The kill switch. Turn it off and nothing is sent within a few minutes; messages keep queuing.</Description>
        <Switch isSelected={dryRun} onChange={setDryRun}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Dry run — record messages but don&apos;t send them
          </Switch.Content>
        </Switch>
        <Description className="-mt-2">
          Use this to check the schedule and the filled-in values on a visit before any guest is messaged. Turn it off to send for real.
        </Description>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-2xs">
        <div>
          <h3 className="text-sm font-semibold">Timing</h3>
          <p className="text-xs text-muted">All times are Indian Standard Time.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField value={quietStart} onChange={setQuietStart}>
            <Label>Quiet hours start</Label>
            <Input type="time" />
          </TextField>
          <TextField value={quietEnd} onChange={setQuietEnd}>
            <Label>Quiet hours end</Label>
            <Input type="time" />
          </TextField>
        </div>
        <Description className="-mt-2">Nothing is sent in this window; messages due then wait until it ends.</Description>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField value={autoComplete} onChange={setAutoComplete}>
            <Label>Auto-complete a visit after (hours)</Label>
            <Input min={0} type="number" />
            <Description>If nobody marks a confirmed visit completed, it is completed this many hours after it ends, so the thank-you isn&apos;t skipped.</Description>
          </TextField>
          <TextField value={expiryDays} onChange={setExpiryDays}>
            <Label>Drop an unsent message after (days)</Label>
            <Input max={60} min={1} type="number" />
            <Description>Stops a late &ldquo;mark completed&rdquo; from sending old messages.</Description>
          </TextField>
        </div>
      </section>

      <Button isPending={isPending} onPress={() => (goingLive ? setConfirmLive(true) : save())}>
        Save settings
      </Button>

      <AlertDialog isOpen={confirmLive} onOpenChange={setConfirmLive}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[440px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="warning" />
                <AlertDialog.Heading>Start sending real messages?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Guests will receive the scheduled WhatsApp messages from now on, including any recorded during a dry run
                  that haven&apos;t expired yet. Make sure the templates are approved and a dry run on a real visit looked right.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Not yet
                </Button>
                <Button isPending={isPending} onPress={save}>
                  Yes, send for real
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
