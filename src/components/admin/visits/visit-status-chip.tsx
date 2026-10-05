import { Chip } from "@heroui/react";
import { visitStatusColor, visitStatusLabel } from "@/lib/visits/constants";

export function VisitStatusChip({ status }: { status: string }) {
  return (
    <Chip color={visitStatusColor(status)} size="sm" variant="soft">
      {visitStatusLabel(status)}
    </Chip>
  );
}
